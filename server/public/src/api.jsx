// ============================================================
// Meridian — Live API client & data adapters
// ============================================================
// Responsible for:
//   1. Fetching from the Express backend (/api/*)
//   2. Adapting MongoDB document shapes → frontend display format
//   3. Providing an SSE subscription that replaces 30s polling
//
// Exposed on window: MeridianAPI, adaptShipment, adaptAlert, adaptOptLog
// ============================================================

// ── API key ───────────────────────────────────────────────────
// Set MERIDIAN_API_KEY in .env. The server skips enforcement in
// development when the key is absent, so this falls back safely.
// In production, inject via window.__MERIDIAN_API_KEY__ from
// a server-rendered meta tag or a build-time replacement.
const API_KEY = window.__MERIDIAN_API_KEY__ ?? '';

function apiHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (API_KEY) h['X-API-Key'] = API_KEY;
  return h;
}

// ── Bulge lookup ──────────────────────────────────────────────
// The map arc renderer needs a bulge scalar per route.
const BULGE_TABLE = {
  "MRD-48271": 0.16,
  "MRD-48265": -0.22,
  "MRD-48259": -0.18,
  "MRD-48244": 0.10,
  "MRD-48238": 0.14,
  "MRD-48221": 0.20,
  "MRD-48210": 0.12,
  "MRD-48199": 0.15,
  "MRD-48184": -0.20,
  "MRD-48170": 0.16,
  "MRD-48151": -0.14,
  "MRD-48142": 0.18,
};

// ── GeoJSON → SVG path ────────────────────────────────────────
/**
 * Projects a GeoJSON LineString onto the 1000×500 equirectangular
 * SVG viewBox used by WorldMap.
 */
function geoJsonToSvgPath(lineString) {
  if (!lineString || !lineString.coordinates || lineString.coordinates.length < 2) return null;
  return lineString.coordinates
    .map(([lon, lat], i) => {
      const normLon = ((lon + 180) % 360 + 360) % 360 - 180;
      const [x, y] = window.project(normLon, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// ── Shipment adapter ──────────────────────────────────────────
function adaptShipment(doc) {
  const fromCity = window.cityByCode[doc.fromCode];
  const toCity   = window.cityByCode[doc.toCode];
  const bulge    = BULGE_TABLE[doc.trackingId] ?? 0.15;
  const location = window.inferShipmentScopeLocation?.(doc) ?? { country: "India", city: "Mumbai" };

  const s = {
    id:            doc.trackingId,
    cargo:         doc.cargoDescription,
    weight:        `${doc.weightTonnes} t`,
    from:          doc.fromCode,
    to:            doc.toCode,
    progress:      doc.progress ?? 0,
    status:        doc.status,
    etaIso:        doc.eta?.estimatedArrival    ?? "—",
    etaOriginal:   doc.eta?.originalArrival     ?? "—",
    etaAbsolute:   doc.eta?.absoluteArrivalAt   ?? null,   // ← new Date field
    delayMin:      doc.eta?.delayMinutes        ?? 0,
    country:       location.country,
    city:          location.city,
    transportType: window.inferTransportType?.(doc) ?? "air",
    bulge,
    _liveDoc: doc,
  };

  if (fromCity && toCity) {
    s._path   = window.arcPath(fromCity, toCity, bulge);
    s._pos    = window.pointAt(fromCity, toCity, s.progress, bulge);
    s._origin = window.project(fromCity.lon, fromCity.lat);
    s._dest   = window.project(toCity.lon, toCity.lat);
  } else {
    const [oLon, oLat] = doc.origin?.coordinates          ?? [0, 0];
    const [dLon, dLat] = doc.destination?.coordinates     ?? [0, 0];
    const [cLon, cLat] = doc.currentLocation?.coordinates ?? [oLon, oLat];
    s._path   = `M${window.project(oLon, oLat).join(",")} L${window.project(dLon, dLat).join(",")}`;
    s._pos    = window.project(cLon, cLat);
    s._origin = window.project(oLon, oLat);
    s._dest   = window.project(dLon, dLat);
  }

  return s;
}

// ── RiskAlert adapter ─────────────────────────────────────────
function adaptAlert(doc) {
  const ring = doc.hazardZone?.coordinates?.[0] ?? [];
  return {
    id:       doc.alertId,
    type:     doc.agentSource,
    title:    doc.title,
    severity: doc.severity,
    affects:  doc.affectedShipmentIds ?? [],
    points:   ring.map(([lon, lat]) => window.project(lon, lat)),
  };
}

// ── OptimizationLog adapter helpers ──────────────────────────

function fmtHours(h) {
  const hrs  = Math.floor(h ?? 0);
  const mins = Math.round(((h ?? 0) - hrs) * 60);
  return mins > 0 ? `T+${hrs}h ${mins}m` : `T+${hrs}h`;
}

function fmtDelta(minutes) {
  const m   = minutes ?? 0;
  const abs = Math.abs(m);
  const h   = Math.floor(abs / 60);
  const rem = abs % 60;
  const sig = m > 0 ? "+" : "-";
  return h > 0 ? `${sig}${h}h ${rem}m` : `${sig}${rem}m`;
}

const STATUS_MAP = {
  PENDING:       "active",
  AUTO_APPROVED: "approved",
  EXECUTED:      "executed",
  REJECTED:      "monitoring",
};

const VERB_MAP = {
  PENDING:       "proposed",
  AUTO_APPROVED: "auto-approved",
  EXECUTED:      "executed",
  REJECTED:      "rejected",
};

function buildTrace(doc) {
  const isPending  = doc.status === "PENDING";
  const isRejected = doc.status === "REJECTED";
  const conf = Math.round((doc.confidenceScore ?? 0) * 100);
  return [
    { a: "intelligence", msg: `Detected hazard ${doc.alertHumanId} intersecting active route.`, done: true },
    { a: "weather",      msg: "Validated official weather conditions and alert window.",       done: true },
    { a: "map",          msg: `Evaluated route constraints - selected ${doc.selectedAlternate}.`, done: true },
    {
      a: "orchestrator",
      msg: isPending
        ? "Awaiting operator approval…"
        : isRejected
          ? "Reroute rejected by operator. Shipment restored to transit."
          : doc.status === "AUTO_APPROVED"
            ? `Auto-approved — confidence ${conf}%. Carrier notified.`
            : "Reroute executed. Route updated in database.",
      done:   !isPending,
      typing: isPending,
    },
  ];
}

// ── OptimizationLog adapter ───────────────────────────────────
function adaptOptLog(doc) {
  const ts  = new Date(doc.createdAt ?? Date.now());
  const hh  = String(ts.getHours()).padStart(2, "0");
  const mm  = String(ts.getMinutes()).padStart(2, "0");
  const ss  = String(ts.getSeconds()).padStart(2, "0");

  const timeSaved = doc.metrics?.timeSavedMinutes ?? 0;
  const savedBad  = timeSaved > 0;

  return {
    id:         doc.optId,
    status:     STATUS_MAP[doc.status] ?? "monitoring",
    agent:      "orchestrator",
    timestamp:  `${hh}:${mm}:${ss}`,
    title:      `Reroute ${VERB_MAP[doc.status] ?? "proposed"} for ${doc.shipmentTrackingId}`,
    shipmentId: doc.shipmentTrackingId,
    alertId:    doc.alertHumanId,
    body:       doc.aiReasoning,
    metrics: {
      originalETA: fmtHours(doc.metrics?.originalETA_h),
      proposedETA: fmtHours(doc.metrics?.proposedETA_h),
      saved:       fmtDelta(timeSaved),
      savedBad,
    },
    agents: buildTrace(doc),
    _raw:              doc,
    _proposedSvgPath:  geoJsonToSvgPath(doc.proposedRoute),
  };
}

// ── MeridianAPI ───────────────────────────────────────────────

const MeridianAPI = {
  /**
   * GET /api/map-state
   * Returns { shipments, alerts, logs } adapted to display format.
   */
  async getMapState() {
    const res = await fetch("/api/map-state", { headers: apiHeaders() });
    if (!res.ok) throw new Error(`/api/map-state responded ${res.status}`);
    const { data } = await res.json();
    return {
      shipments: (data.shipments     ?? []).map(adaptShipment),
      alerts:    (data.alerts        ?? []).map(adaptAlert),
      logs:      (data.optimizations ?? []).map(adaptOptLog),
    };
  },

  /**
   * GET /api/kpis
   * Returns live KPI aggregations from the database.
   */
  async getKpis() {
    const res = await fetch("/api/kpis", { headers: apiHeaders() });
    if (!res.ok) throw new Error(`/api/kpis responded ${res.status}`);
    const { data } = await res.json();
    return data;
  },

  /**
   * POST /api/simulate
   * Triggers the Gemini AI pipeline. Returns an adapted REASONING entry.
   */
  async simulate() {
    const res  = await fetch("/api/simulate", {
      method:  "POST",
      headers: apiHeaders(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `/api/simulate responded ${res.status}`);
    return adaptOptLog(body.data.optimizationLog);
  },

  /**
   * PUT /api/optimize/:id/execute
   * Approves a PENDING reroute and applies it to the shipment.
   */
  async executeReroute(id, resolvedBy = "operator") {
    const res  = await fetch(`/api/optimize/${encodeURIComponent(id)}/execute`, {
      method:  "PUT",
      headers: apiHeaders(),
      body:    JSON.stringify({ resolvedBy }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `execute responded ${res.status}`);
    return body;
  },

  /**
   * PUT /api/optimize/:id/reject
   * Rejects a PENDING reroute and restores the shipment to transit.
   */
  async rejectReroute(id, resolvedBy = "operator") {
    const res  = await fetch(`/api/optimize/${encodeURIComponent(id)}/reject`, {
      method:  "PUT",
      headers: apiHeaders(),
      body:    JSON.stringify({ resolvedBy }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `reject responded ${res.status}`);
    return body;
  },

  /**
   * subscribeToEvents
   * ─────────────────
   * Opens a Server-Sent Events connection to GET /api/events.
   * Returns an EventSource that the caller should store and close
   * on component unmount via `es.close()`.
   *
   * Events emitted by the server:
   *   "simulation:complete"  → { optimizationLog, alertId }
   *   "reroute:executed"     → { optId, shipmentId }
   *   "reroute:rejected"     → { optId, shipmentId }
   *
   * @param handlers - Map of event name → handler function
   * @returns the underlying EventSource instance
   */
  subscribeToEvents(handlers = {}) {
    const es = new EventSource("/api/events");

    es.addEventListener("connected", () => {
      console.log("[Meridian] SSE stream connected");
    });

    for (const [event, handler] of Object.entries(handlers)) {
      es.addEventListener(event, (e) => {
        try {
          handler(JSON.parse(e.data));
        } catch (err) {
          console.warn(`[Meridian] SSE parse error on "${event}":`, err);
        }
      });
    }

    es.onerror = (err) => {
      // EventSource auto-reconnects after a transient error — just log it
      console.warn("[Meridian] SSE error (will auto-reconnect):", err);
    };

    return es;
  },
};

// Expose for use across Babel script tags
Object.assign(window, {
  MeridianAPI,
  adaptShipment,
  adaptAlert,
  adaptOptLog,
  geoJsonToSvgPath,
});
