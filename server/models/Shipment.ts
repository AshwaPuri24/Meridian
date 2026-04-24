import { Schema, model, Document, Model } from 'mongoose';
import type { IGeoPoint, IGeoLineString } from '../types/geo';

// ─────────────────────────────────────────────────────────────
// ETA / delay metrics sub-document
// ─────────────────────────────────────────────────────────────

export interface IETAMetrics {
  /** Human-readable relative label e.g. "T+18h 22m" — for display */
  estimatedArrival: string;
  /** Original ETA label before any disruption — for display */
  originalArrival: string;
  /** Positive = delayed, negative = early, 0 = on-time (minutes) */
  delayMinutes: number;
  /**
   * Absolute UTC timestamp for the estimated arrival.
   * Enables sorting, comparison, and "time remaining" calculations.
   * Derived from estimatedArrival + createdAt when the shipment is seeded
   * or updated by a reroute execution.
   */
  absoluteArrivalAt?: Date;
}

// ─────────────────────────────────────────────────────────────
// Shipment status enum
// ─────────────────────────────────────────────────────────────

export type ShipmentStatus =
  | 'transit'    // nominal — moving normally
  | 'risk'       // an active hazard intersects the route
  | 'delayed'    // confirmed delay, no reroute yet
  | 'rerouted'   // an OptimizationLog has been EXECUTED
  | 'delivered'; // journey complete

// ─────────────────────────────────────────────────────────────
// Transport mode enum
// ─────────────────────────────────────────────────────────────

/**
 * The four classes Meridian routes across.
 *
 * OCEAN / AIR — free-space routing: routes are short, sparse LineStrings
 *               (typically 2–10 waypoints on great-circle arcs).
 * ROAD / RAIL — constrained routing: routes follow real infrastructure
 *               and arrive as dense polylines from Google Maps Directions
 *               API or similar (can contain hundreds of coordinates).
 */
export type TransportMode = 'OCEAN' | 'AIR' | 'ROAD' | 'RAIL';

export const TRANSPORT_MODES: readonly TransportMode[] = [
  'OCEAN',
  'AIR',
  'ROAD',
  'RAIL',
] as const;

// ─────────────────────────────────────────────────────────────
// Vehicle constraints sub-document
// ─────────────────────────────────────────────────────────────

/**
 * Optional hints the Orchestrator Agent consumes when scoring
 * alternate routes. Not strictly required on every shipment —
 * absent fields mean "no constraint".
 */
export interface IVehicleConstraints {
  /** Maximum cargo weight the assigned vehicle can carry (tonnes). */
  maxWeight?: number;
  /** True = refrigerated / temperature-controlled transit required. */
  requiresColdChain?: boolean;
  /** UN hazardous-material class label, e.g. "3" (flammable liquid). */
  hazmatClass?: string;
}

// ─────────────────────────────────────────────────────────────
// Shipment document interface
// ─────────────────────────────────────────────────────────────

export interface IShipment extends Document {
  /** Human-readable tracking ID, e.g. "MRD-48271" */
  trackingId: string;

  // ── Cargo ─────────────────────────────────────────────────
  cargoDescription: string;
  weightTonnes: number;

  // ── Route ─────────────────────────────────────────────────
  /** IATA / hub code for the origin city */
  fromCode: string;
  /** IATA / hub code for the destination city */
  toCode: string;

  /**
   * Mode of transport. Drives which external routing engine the
   * Orchestrator Agent consults (great-circle vs. Google Maps
   * Directions / rail network graph) and which constraints apply.
   */
  transportMode: TransportMode;

  /** Optional vehicle-level constraints used by the AI for scoring. */
  vehicleConstraints?: IVehicleConstraints;

  /** GeoJSON Point: shipment departure hub */
  origin: IGeoPoint;

  /** GeoJSON Point: shipment destination hub */
  destination: IGeoPoint;

  /**
   * GeoJSON Point: live position of the shipment.
   * Updated by the monitoring agent on each tick.
   */
  currentLocation: IGeoPoint;

  /**
   * GeoJSON LineString — the currently-active route path.
   *
   * Intentionally a plain GeoJSON LineString so it transparently
   * accepts:
   *   • OCEAN / AIR — 2–10 sparse waypoints on a great-circle arc.
   *   • ROAD / RAIL — dense polylines (hundreds of coordinates)
   *     returned by Google Maps Directions API or a rail graph.
   *
   * Replaced wholesale when an OptimizationLog is EXECUTED.
   */
  activeRoute: IGeoLineString;

  // ── Progress & status ─────────────────────────────────────
  /** 0.0 → 1.0 fraction of journey completed */
  progress: number;
  status: ShipmentStatus;

  // ── ETA ───────────────────────────────────────────────────
  eta: IETAMetrics;

  // ── Timestamps ────────────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────
// Sub-schemas
// ─────────────────────────────────────────────────────────────

const GeoPointSchema = new Schema<IGeoPoint>(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) =>
          v.length === 2 &&
          v[0] >= -180 && v[0] <= 180 &&
          v[1] >= -90  && v[1] <= 90,
        message: 'coordinates must be [longitude(-180–180), latitude(-90–90)]',
      },
    },
  },
  { _id: false }
);

const GeoLineStringSchema = new Schema<IGeoLineString>(
  {
    type: {
      type: String,
      enum: ['LineString'],
      required: true,
      default: 'LineString',
    },
    coordinates: {
      type: [[Number]],
      required: true,
      validate: {
        // No upper bound on length: Google Maps polylines for Road / Rail
        // routes can contain hundreds of vertices and must be preserved
        // verbatim so the map renders the real road geometry.
        validator: (v: number[][]) =>
          v.length >= 2 &&
          v.every(pair =>
            pair.length === 2 &&
            pair[0] >= -180 && pair[0] <= 180 &&
            pair[1] >= -90  && pair[1] <= 90
          ),
        message:
          'LineString must have ≥ 2 pairs; each [longitude(-180–180), latitude(-90–90)]',
      },
    },
  },
  { _id: false }
);

const ETAMetricsSchema = new Schema<IETAMetrics>(
  {
    estimatedArrival:  { type: String, required: true },
    originalArrival:   { type: String, required: true },
    delayMinutes:      { type: Number, required: true, default: 0 },
    absoluteArrivalAt: { type: Date,   default: null },
  },
  { _id: false }
);

const VehicleConstraintsSchema = new Schema<IVehicleConstraints>(
  {
    maxWeight:         { type: Number,  min: 0 },
    requiresColdChain: { type: Boolean, default: false },
    hazmatClass:       { type: String,  trim: true },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────
// Main Shipment schema
// ─────────────────────────────────────────────────────────────

const ShipmentSchema = new Schema<IShipment>(
  {
    trackingId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^MRD-\d+$/,
    },

    cargoDescription: { type: String, required: true, trim: true },
    weightTonnes:     { type: Number, required: true, min: 0 },

    fromCode: { type: String, required: true, uppercase: true, trim: true },
    toCode:   { type: String, required: true, uppercase: true, trim: true },

    transportMode: {
      type: String,
      enum: TRANSPORT_MODES as unknown as TransportMode[],
      required: true,
      default: 'OCEAN',
      uppercase: true,
      trim: true,
    },

    vehicleConstraints: { type: VehicleConstraintsSchema, default: undefined },

    origin:          { type: GeoPointSchema,      required: true },
    destination:     { type: GeoPointSchema,      required: true },
    currentLocation: { type: GeoPointSchema,      required: true },
    activeRoute:     { type: GeoLineStringSchema, required: true },

    progress: { type: Number, required: true, min: 0, max: 1, default: 0 },

    status: {
      type: String,
      enum: ['transit', 'risk', 'delayed', 'rerouted', 'delivered'] as ShipmentStatus[],
      required: true,
      default: 'transit',
    },

    eta: { type: ETAMetricsSchema, required: true },
  },
  {
    timestamps: true, // adds createdAt / updatedAt automatically
    collection: 'shipments',
  }
);

// ─────────────────────────────────────────────────────────────
// 2dsphere indexes — required for $geoIntersects / $near queries
// ─────────────────────────────────────────────────────────────

ShipmentSchema.index({ origin:          '2dsphere' });
ShipmentSchema.index({ destination:     '2dsphere' });
ShipmentSchema.index({ currentLocation: '2dsphere' });
ShipmentSchema.index({ activeRoute:     '2dsphere' });

// Compound index for fast status-filtered list queries
ShipmentSchema.index({ status: 1, updatedAt: -1 });

// Compound index for mode-scoped queries (e.g. "all ROAD shipments at risk")
ShipmentSchema.index({ transportMode: 1, status: 1 });

// ─────────────────────────────────────────────────────────────
// Model export
// ─────────────────────────────────────────────────────────────

const Shipment: Model<IShipment> = model<IShipment>('Shipment', ShipmentSchema);
export default Shipment;
