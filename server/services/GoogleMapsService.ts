/**
 * ============================================================
 * GoogleMapsService.ts
 * ============================================================
 * Driving-route calculator backed by the Google Maps Directions
 * API. Used by Meridian's ROAD-mode shipments to compute physical
 * highway detours that steer around an active hazard polygon.
 *
 * Hazard-avoidance strategy (MVP)
 * ───────────────────────────────
 * The Directions API does not accept "avoid polygon" parameters
 * natively, and doing true polygon-avoidance routing would require
 * a GIS stack (Turf.js + iterative detour waypoint sampling) that
 * is out of scope for a single service file.
 *
 * Instead, when a hazard polygon is supplied we:
 *   1. Request ALL alternates from Google (`alternatives: true`).
 *   2. Compute the axis-aligned bounding-box center of the hazard.
 *   3. Decode each candidate's `overview_polyline`.
 *   4. Score each candidate by its CLOSEST-APPROACH distance (km)
 *      to the hazard center — larger is safer.
 *   5. Return the candidate with the greatest closest-approach.
 *
 * Output: a GeoJSON LineString whose `coordinates` are the decoded,
 * high-density [longitude, latitude] pairs from Google's polyline —
 * directly compatible with `Shipment.activeRoute`.
 * ============================================================
 */

import {
  Client,
  TravelMode,
  Status,
  type DirectionsResponse,
} from '@googlemaps/google-maps-services-js';

import type { IGeoLineString } from '../types/geo';

// ─────────────────────────────────────────────────────────────
// 1.  Client
// ─────────────────────────────────────────────────────────────

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
  // We do NOT exit here — other Meridian services (Orchestrator,
  // SSE) are fine without Google Maps. We only fail when a caller
  // actually tries to compute a road detour without the key.
  console.warn(
    '[GoogleMapsService] GOOGLE_MAPS_API_KEY is not set — ' +
    'calculateRoadDetour() will throw until the key is provided.',
  );
}

const client = new Client({});

// ─────────────────────────────────────────────────────────────
// 2.  Types
// ─────────────────────────────────────────────────────────────

/** [longitude, latitude] — Meridian's canonical coordinate order. */
export type LonLat = [number, number];

/**
 * Rich error surfaced to callers. Carries the upstream Google
 * status string (`ZERO_RESULTS`, `OVER_QUERY_LIMIT`, etc.) when
 * available so controllers can decide between retry and fallback.
 */
export class GoogleMapsServiceError extends Error {
  public readonly status?: string;
  public readonly detail?: unknown;

  constructor(message: string, status?: string, detail?: unknown) {
    super(message);
    this.name   = 'GoogleMapsServiceError';
    this.status = status;
    this.detail = detail;
    Object.setPrototypeOf(this, GoogleMapsServiceError.prototype);
  }
}

// ─────────────────────────────────────────────────────────────
// 3.  Polyline decoder (Google Encoded Polyline Algorithm)
// ─────────────────────────────────────────────────────────────

/**
 * Decode an encoded polyline string into an array of [lon, lat]
 * coordinate pairs.
 *
 * Implemented inline so the service does not depend on a
 * `/dist/util` path that upstream may refactor between minor
 * versions. The algorithm itself is frozen and well-specified.
 *
 * Reference:
 *   https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function decodePolyline(encoded: string): LonLat[] {
  const path: LonLat[] = [];
  let index = 0;
  let lat   = 0;
  let lng   = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    // ── latitude delta ──
    do {
      byte    = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift  += 5;
    } while (byte >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    // ── longitude delta ──
    shift = 0;
    result = 0;
    do {
      byte    = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift  += 5;
    } while (byte >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    path.push([lng * 1e-5, lat * 1e-5]);
  }

  return path;
}

// ─────────────────────────────────────────────────────────────
// 4.  Geometry helpers
// ─────────────────────────────────────────────────────────────

/**
 * Axis-aligned bounding-box center of a polygon ring.
 *
 * Fast, deterministic, and adequate for MVP hazard-avoidance
 * scoring. A true centroid would require triangulation and is
 * not meaningfully better for picking alternate highway routes.
 */
function polygonBoundingBoxCenter(polygon: LonLat[]): LonLat {
  if (polygon.length === 0) {
    throw new GoogleMapsServiceError('Hazard polygon is empty');
  }

  let minLon =  Infinity, maxLon = -Infinity;
  let minLat =  Infinity, maxLat = -Infinity;

  for (const [lon, lat] of polygon) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

/**
 * Great-circle distance in kilometers between two [lon, lat] pairs.
 * Earth radius 6371 km. Clamps asin argument to guard against tiny
 * floating-point overshoots near antipodal points.
 */
function haversineKm(a: LonLat, b: LonLat): number {
  const R     = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Closest-approach distance (km) from any vertex of `path`
 * to `target`.
 *
 * Vertex-only approximation — good enough because Google's
 * overview polylines are densely sampled on highways (typically
 * one point every 10–20 m), so the error vs. segment-distance
 * is bounded by a few metres.
 */
function closestApproachKm(path: LonLat[], target: LonLat): number {
  let min = Infinity;
  for (const p of path) {
    const d = haversineKm(p, target);
    if (d < min) min = d;
  }
  return min;
}

// ─────────────────────────────────────────────────────────────
// 5.  Input guards
// ─────────────────────────────────────────────────────────────

function assertLonLat(value: unknown, label: string): asserts value is LonLat {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    Number.isNaN(value[0]) || Number.isNaN(value[1]) ||
    value[0] < -180 || value[0] > 180 ||
    value[1] < -90  || value[1] > 90
  ) {
    throw new GoogleMapsServiceError(
      `${label} must be [longitude(-180..180), latitude(-90..90)]`,
    );
  }
}

/** Google Maps expects "lat,lng"; Meridian uses [lon, lat]. */
function toLatLngString([lon, lat]: LonLat): string {
  return `${lat},${lon}`;
}

// ─────────────────────────────────────────────────────────────
// 6.  Route selection
// ─────────────────────────────────────────────────────────────

interface ScoredRoute {
  decoded:  LonLat[];
  /** Closest distance (km) from this route to the hazard center. */
  safetyKm: number;
}

/**
 * Pick the candidate route whose closest approach to the hazard
 * center is the greatest. Tie-breaker: fewer vertices (usually
 * shorter / cheaper route).
 */
function pickSafestRoute(candidates: ScoredRoute[]): ScoredRoute {
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const wider   = c.safetyKm > best.safetyKm;
    const tieBeat = c.safetyKm === best.safetyKm && c.decoded.length < best.decoded.length;
    if (wider || tieBeat) best = c;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────
// 7.  Public API
// ─────────────────────────────────────────────────────────────

/**
 * calculateRoadDetour
 * ───────────────────
 * Compute a driving route from `origin` to `destination`, optionally
 * biased away from `hazardPolygon`.
 *
 * Behaviour:
 *   • No hazard           → returns Google's primary route.
 *   • Hazard polygon given → requests alternatives and returns the
 *                            one whose closest approach to the
 *                            polygon's bounding-box center is widest.
 *
 * The returned LineString is dense (hundreds of coordinates on a
 * typical intercity route) — persist it verbatim into
 * `Shipment.activeRoute` so the frontend map draws the real road
 * geometry, not a straight line.
 *
 * @param origin         - [longitude, latitude] of start.
 * @param destination    - [longitude, latitude] of end.
 * @param hazardPolygon  - Optional ring of [lon, lat] pairs. Need
 *                         not be closed — only the extents are used.
 * @returns              - GeoJSON LineString compatible with the
 *                         `activeRoute` field on `Shipment`.
 * @throws GoogleMapsServiceError
 *         If the API key is missing, inputs are invalid, the upstream
 *         request fails, Google returns a non-OK status, or no
 *         decodable route is produced.
 */
export async function calculateRoadDetour(
  origin:        LonLat,
  destination:   LonLat,
  hazardPolygon?: LonLat[],
): Promise<IGeoLineString> {

  // ── Preflight ────────────────────────────────────────────
  if (!GOOGLE_MAPS_API_KEY) {
    throw new GoogleMapsServiceError(
      'GOOGLE_MAPS_API_KEY is not set — cannot call the Directions API',
    );
  }

  assertLonLat(origin,      'origin');
  assertLonLat(destination, 'destination');

  const wantAlternates = Array.isArray(hazardPolygon) && hazardPolygon.length > 0;

  // ── Upstream call ────────────────────────────────────────
  let response: DirectionsResponse;
  try {
    response = await client.directions({
      params: {
        origin:       toLatLngString(origin),
        destination:  toLatLngString(destination),
        mode:         TravelMode.driving,
        alternatives: wantAlternates,
        key:          GOOGLE_MAPS_API_KEY,
      },
      timeout: 10_000,
    });
  } catch (err) {
    throw new GoogleMapsServiceError(
      'Google Maps Directions request failed (network or client error)',
      undefined,
      err instanceof Error ? err.message : err,
    );
  }

  const body = response.data;

  if (body.status !== Status.OK) {
    throw new GoogleMapsServiceError(
      `Google Maps Directions returned non-OK status: ${body.status}`,
      body.status,
      body.error_message,
    );
  }

  if (!Array.isArray(body.routes) || body.routes.length === 0) {
    throw new GoogleMapsServiceError(
      'Google Maps Directions returned no routes',
      body.status,
    );
  }

  // ── Decode every candidate's overview polyline ───────────
  const candidates: ScoredRoute[] = body.routes
    .map(r => r.overview_polyline?.points)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map(points => ({ decoded: decodePolyline(points), safetyKm: 0 }))
    .filter(r => r.decoded.length >= 2);

  if (candidates.length === 0) {
    throw new GoogleMapsServiceError(
      'Directions response contained no decodable overview_polyline',
    );
  }

  // ── Select the chosen route ──────────────────────────────
  let chosen: LonLat[];

  if (wantAlternates) {
    const hazardCenter = polygonBoundingBoxCenter(hazardPolygon!);
    for (const c of candidates) {
      c.safetyKm = closestApproachKm(c.decoded, hazardCenter);
    }
    chosen = pickSafestRoute(candidates).decoded;
  } else {
    chosen = candidates[0].decoded;
  }

  // ── Final shape: GeoJSON LineString ──────────────────────
  return {
    type:        'LineString',
    coordinates: chosen,
  };
}

// ─────────────────────────────────────────────────────────────
// 8.  Test-only exports
// ─────────────────────────────────────────────────────────────
//
// Exposed for unit tests (server/tests/). Not part of the public
// runtime surface — callers should use `calculateRoadDetour` only.
//
export const __test__ = {
  decodePolyline,
  polygonBoundingBoxCenter,
  haversineKm,
  closestApproachKm,
  pickSafestRoute,
};
