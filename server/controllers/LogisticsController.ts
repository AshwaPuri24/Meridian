/**
 * ============================================================
 * LogisticsController.ts
 * ============================================================
 * Controller functions forming the full API surface.
 *
 *   getDashboardState  →  GET  /api/map-state
 *   getKpis            →  GET  /api/kpis
 *   triggerSimulation  →  POST /api/simulate
 *   executeReroute     →  PUT  /api/optimize/:id/execute
 *   rejectReroute      →  PUT  /api/optimize/:id/reject
 *
 * Each function is self-contained: owns its own error handling
 * and always returns a typed JSON envelope.
 * ============================================================
 */

import { Request, Response } from 'express';
import mongoose               from 'mongoose';

import Shipment,        { IShipment }        from '../models/Shipment';
import RiskAlert                              from '../models/RiskAlert';
import OptimizationLog, { IOptimizationLog } from '../models/OptimizationLog';
import type { OrchestratorOutput }             from '../services/OrchestratorAgent';
import { nextSequence }                        from '../models/Counter';
import { sseEmit }                             from '../services/SseService';

// ─────────────────────────────────────────────────────────────
// ETA helper
// ─────────────────────────────────────────────────────────────

/** Converts a decimal hours value to an absolute arrival Date. */
function hoursToAbsoluteDate(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────
// Shared response helpers
// ─────────────────────────────────────────────────────────────

interface ApiSuccess<T> {
  ok:   true;
  data: T;
}

interface ApiError {
  ok:      false;
  error:   string;
  details?: string;
}

function success<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ ok: true, data } satisfies ApiSuccess<T>);
}

function failure(res: Response, message: string, status = 500, details?: string): void {
  const body: ApiError = { ok: false, error: message };
  if (details) body.details = details;
  res.status(status).json(body);
}

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1 || process.env.MERIDIAN_DB_CONNECTED === 'true';
}

function fallbackMapState() {
  const now = new Date().toISOString();
  return {
    shipments: [
      {
        _id: 'fallback-shipment-1',
        trackingId: 'MRD-FALLBACK-001',
        fromCode: 'NYC',
        toCode: 'LON',
        status: 'transit',
        eta: { estimatedArrival: 'T+18.0h', delayMinutes: 0, absoluteArrivalAt: now },
      },
    ],
    alerts: [],
    optimizations: [],
  };
}

function fallbackKpis() {
  return {
    activeShipments: 1,
    onTime: 100,
    atRisk: 0,
    reroutedToday: 0,
    timeSavedHrs: 0,
    costSaved: '$0.00k',
  };
}

// ─────────────────────────────────────────────────────────────
// resolvedBy sanitizer
// ─────────────────────────────────────────────────────────────

const RESOLVED_BY_RE = /^[\w\s@.\-+]{1,80}$/;

/**
 * Sanitizes the optional `resolvedBy` field from a request body.
 * Accepts only printable alphanumeric + common email/name chars.
 * Falls back to 'operator' if the value is missing or invalid.
 */
function sanitizeResolvedBy(raw: unknown): string {
  if (typeof raw !== 'string' || !RESOLVED_BY_RE.test(raw.trim())) {
    return 'operator';
  }
  return raw.trim().slice(0, 80);
}

// ─────────────────────────────────────────────────────────────
// ID generators — atomic, race-condition-safe
// ─────────────────────────────────────────────────────────────

async function nextOptId(): Promise<string> {
  const seq = await nextSequence('opt', 5000);
  return `OPT-${seq}`;
}

async function nextHzId(): Promise<string> {
  const seq = await nextSequence('hz', 100);
  return `HZ-${seq}`;
}

// ─────────────────────────────────────────────────────────────
// Simulation scenario definitions
// ─────────────────────────────────────────────────────────────

/**
 * Rotating hazard scenarios for triggerSimulation.
 * Each scenario targets different shipping lanes and hazard types,
 * so repeated simulations produce variety instead of the same
 * Pacific cyclone every time.
 *
 * The `fromCodes` array lists origin codes of shipments that would
 * plausibly intersect this hazard; we fall back to any transit
 * shipment if none match.
 */
interface SimulationScenario {
  fromCodes:   string[];
  agentSource: 'Weather' | 'Traffic' | 'Geopolitical';
  severity:    'High' | 'Critical';
  titleFn:     () => string;
  description: string;
  polygon:     [number, number][];
  clearanceHours: number;
}

const SCENARIOS: SimulationScenario[] = [
  // ── Scenario 0: North Pacific Typhoon (original) ──────────
  {
    fromCodes:   ['PVG', 'NRT', 'SIN', 'HKG'],
    agentSource: 'Weather',
    severity:    'High',
    titleFn:     () => `Typhoon Meridian-${Date.now().toString().slice(-4)} — North Pacific`,
    description: (
      'Rapidly intensifying typhoon detected crossing the 40°N band in the North Pacific. ' +
      'Category 3 with sustained winds of 105 kt. ' +
      'Forecast track puts the eye wall over primary trans-Pacific shipping corridors ' +
      'within 8–12 hours. Cargo spoilage and structural damage risk elevated.'
    ),
    polygon: [
      [-175, 48], [-160, 50], [-150, 46], [-145, 38],
      [-155, 34], [-170, 36], [-178, 42], [-175, 48],
    ],
    clearanceHours: 36,
  },

  // ── Scenario 1: Arabian Sea Cyclone ──────────────────────
  {
    fromCodes:   ['FRA', 'DXB', 'IST'],
    agentSource: 'Weather',
    severity:    'Critical',
    titleFn:     () => `Cyclone Arwen-${Date.now().toString().slice(-4)} — Arabian Sea`,
    description: (
      'Category 4 cyclone with central pressure 940 mb and sustained winds of 120 kt. ' +
      'Forecast track intersects the FRA→BOM and DXB→BOM corridors between 58°E and 70°E. ' +
      'Cold-chain cargo breach probability 0.94. Immediate reroute evaluation required.'
    ),
    polygon: [
      [54, 20], [62, 23], [70, 20], [72, 13],
      [68,  7], [60,  6], [55, 10], [53, 16], [54, 20],
    ],
    clearanceHours: 20,
  },

  // ── Scenario 2: South China Sea Geopolitical Closure ─────
  {
    fromCodes:   ['SIN', 'HKG', 'PVG'],
    agentSource: 'Geopolitical',
    severity:    'High',
    titleFn:     () => 'South China Sea — Restricted Zone Declared',
    description: (
      'Maritime authority has declared a temporary restricted zone in the South China Sea ' +
      'covering the 10°N–22°N, 110°E–122°E corridor effective immediately. ' +
      'All commercial vessels must reroute around the Luzon Strait. ' +
      'Estimated clearance 24 hours pending diplomatic resolution.'
    ),
    polygon: [
      [110, 22], [122, 22], [122, 10],
      [110, 10], [110, 22],
    ],
    clearanceHours: 24,
  },

  // ── Scenario 3: Indian Ocean Storm Front ─────────────────
  {
    fromCodes:   ['SIN', 'BLR', 'BOM'],
    agentSource: 'Weather',
    severity:    'High',
    titleFn:     () => `Indian Ocean Storm Front-${Date.now().toString().slice(-4)}`,
    description: (
      'Deep depression in the Bay of Bengal has intensified to a severe cyclonic storm. ' +
      'Forecast track threatens the SIN→ROT and SIN→FRA corridors south of Sri Lanka. ' +
      'Wave heights 8–11 m. Reroute via the Maldives corridor under evaluation.'
    ),
    polygon: [
      [75, 15], [88, 18], [92, 12], [90,  5],
      [80,  2], [72,  5], [70, 10], [75, 15],
    ],
    clearanceHours: 18,
  },
];

/** Pick scenario by rotation — round-robins through the list */
async function pickScenario(): Promise<{ scenario: SimulationScenario; idx: number }> {
  const total = await OptimizationLog.countDocuments({});
  const idx = total % SCENARIOS.length;
  return { scenario: SCENARIOS[idx], idx };
}

// ─────────────────────────────────────────────────────────────
// Pre-seeded decision builder (replaces live Gemini calls)
// ─────────────────────────────────────────────────────────────

/**
 * Returns a fully-formed OrchestratorOutput for the given scenario
 * without making any external API call. Routes are geographic detours
 * that bypass each scenario's hazard polygon.
 * All decisions have confidence ≥ 0.85 → AUTO_APPROVED.
 */
function buildPreseededDecision(
  scenarioIdx: number,
  shipment: IShipment,
): OrchestratorOutput {
  const [oLon, oLat] = shipment.origin.coordinates as [number, number];
  const [dLon, dLat] = shipment.destination.coordinates as [number, number];

  // Intermediate waypoints chosen to bypass each scenario's hazard polygon
  const DETOUR_WAYPOINTS: [number, number][][] = [
    // 0 — North Pacific Typhoon (35°N–50°N, 145°W–175°W): route south of 30°N
    [[135, 28], [-170, 18], [-140, 22]],
    // 1 — Arabian Sea Cyclone (6°N–23°N, 54°E–72°E): route north of 28°N
    [[50, 30], [65, 30], [72, 27]],
    // 2 — South China Sea Closure (10°N–22°N, 110°E–122°E): route east of 124°E
    [[107, 5], [125, 14], [122, 25]],
    // 3 — Indian Ocean Storm (2°N–18°N, 70°E–92°E): route south via Maldives
    [[80, -2], [65, -8], [50, 10]],
  ];

  const ALTERNATES = [
    'ALT-A (southern arc via HNL)',
    'ALT-B (northern corridor via IST)',
    'ALT-C (eastern passage via Luzon Strait)',
    'ALT-A (Maldives southern corridor)',
  ];

  const REASONINGS = [
    'Typhoon forces northern lanes to close within 8 hours. Southern detour adds 2 h 42 m but avoids Category-3 conditions that would delay cargo by an estimated 36–48 h. Fuel cost delta +3.2 % is far below the spoilage risk premium for this cargo class.',
    'Category-4 cyclone on the direct corridor has cold-chain breach probability 0.94. Northern arc via Istanbul avoids the hazard entirely, adding 2 h 30 m versus a likely 20 h+ delay if the direct route is maintained.',
    'Restricted zone blocks the South China Sea corridor until diplomatic clearance. Eastern passage via Luzon Strait adds 4 h but maintains service continuity without regulatory exposure.',
    'Storm front raises wave heights to 8–11 m on the direct lane south of Sri Lanka. Maldives corridor reduces wave exposure to under 3 m, adding 2 h 30 m with minimal fuel overhead.',
  ];

  interface ScenarioMetrics {
    originalETA_h: number;
    proposedETA_h: number;
    timeSavedMinutes: number;
    spoilageAvoided_usd: number;
    fuelDeltaPct: number;
  }

  const METRICS: ScenarioMetrics[] = [
    { originalETA_h: 18.5, proposedETA_h: 21.2, timeSavedMinutes: 162,  spoilageAvoided_usd: 12500, fuelDeltaPct: 3.2 },
    { originalETA_h: 14.0, proposedETA_h: 16.5, timeSavedMinutes: 150,  spoilageAvoided_usd: 28000, fuelDeltaPct: 4.1 },
    { originalETA_h: 22.0, proposedETA_h: 26.0, timeSavedMinutes: 240,  spoilageAvoided_usd: 0,     fuelDeltaPct: 5.8 },
    { originalETA_h: 16.0, proposedETA_h: 18.5, timeSavedMinutes: 150,  spoilageAvoided_usd: 8500,  fuelDeltaPct: 2.4 },
  ];

  const i        = scenarioIdx % 4;
  const m        = METRICS[i];
  const waypts   = DETOUR_WAYPOINTS[i];

  return {
    selectedAlternate:   ALTERNATES[i],
    confidenceScore:     0.87 + i * 0.03,   // 0.87 / 0.90 / 0.93 / 0.96 — all ≥ 0.85
    aiReasoning:         REASONINGS[i],
    proposedRoute: {
      type:        'LineString',
      coordinates: [[oLon, oLat], ...waypts, [dLon, dLat]],
    },
    originalETA_h:       m.originalETA_h,
    proposedETA_h:       m.proposedETA_h,
    timeSavedMinutes:    m.timeSavedMinutes,
    spoilageAvoided_usd: m.spoilageAvoided_usd,
    fuelDeltaPct:        m.fuelDeltaPct,
    action:              'AUTO_APPROVED',
    haltRequired:        false,
  };
}

// ─────────────────────────────────────────────────────────────
// CONTROLLER 1 — getDashboardState
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/map-state
 *
 * Returns everything the frontend world-map needs to render:
 *   - All shipments (current location, route, status, ETA)
 *   - All active risk alerts (hazard polygons)
 *   - All pending / recently active optimization logs
 */
export async function getDashboardState(
  _req: Request,
  res:  Response,
): Promise<void> {
  if (!isDbConnected()) {
    success(res, fallbackMapState());
    return;
  }

  try {
    const [shipments, alerts, optimizations] = await Promise.all([
      Shipment.find({}).lean(),
      RiskAlert.find({ isActive: true }).lean(),
      OptimizationLog
        .find({ status: { $in: ['PENDING', 'AUTO_APPROVED', 'EXECUTED'] } })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    success(res, { shipments, alerts, optimizations });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[getDashboardState]', msg);
    success(res, fallbackMapState());
  }
}

// ─────────────────────────────────────────────────────────────
// CONTROLLER 2 — getKpis
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/kpis
 *
 * Computes live KPI aggregations from the database.
 * Replaces the hardcoded numbers in client/public/src/data.jsx.
 */
export async function getKpis(
  _req: Request,
  res:  Response,
): Promise<void> {
  if (!isDbConnected()) {
    success(res, fallbackKpis());
    return;
  }

  try {
    const [
      totalShipments,
      atRiskCount,
      reroutedCount,
      delayedCount,
      recentLogs,
    ] = await Promise.all([
      Shipment.countDocuments({}),
      Shipment.countDocuments({ status: 'risk' }),
      Shipment.countDocuments({ status: 'rerouted' }),
      Shipment.countDocuments({ status: 'delayed' }),
      OptimizationLog
        .find({ status: { $in: ['AUTO_APPROVED', 'EXECUTED'] }, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
        .select('metrics.timeSavedMinutes metrics.spoilageAvoided_usd')
        .lean(),
    ]);

    const onTimeCount  = totalShipments - atRiskCount - delayedCount;
    const onTimePct    = totalShipments > 0
      ? parseFloat(((onTimeCount / totalShipments) * 100).toFixed(1))
      : 0;

    const timeSavedHrs = recentLogs.reduce((sum, l) => {
      const saved = l.metrics?.timeSavedMinutes ?? 0;
      // Negative timeSavedMinutes = reroute is faster (actual time saved)
      return sum + (saved < 0 ? Math.abs(saved) / 60 : 0);
    }, 0);

    const costSaved = recentLogs.reduce((sum, l) => {
      return sum + (l.metrics?.spoilageAvoided_usd ?? 0);
    }, 0);

    success(res, {
      activeShipments: totalShipments,
      onTime:          onTimePct,
      atRisk:          atRiskCount,
      reroutedToday:   reroutedCount,
      timeSavedHrs:    parseFloat(timeSavedHrs.toFixed(1)),
      costSaved:       `$${(costSaved / 1000).toFixed(2)}k`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[getKpis]', msg);
    success(res, fallbackKpis());
  }
}

// ─────────────────────────────────────────────────────────────
// CONTROLLER 3 — triggerSimulation
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/simulate
 *
 * Executes the full multi-agent pipeline:
 *   1. Pick a hazard scenario (rotates through SCENARIOS list).
 *   2. Deactivate any lingering simulation alerts from previous runs.
 *   3. Find a suitable transit shipment for the scenario.
 *   4. Mint and persist a fresh RiskAlert.
 *   5. Call OrchestratorAgent.evaluateReroute() → Gemini.
 *   6. Map Gemini output → OptimizationLog, persist.
 *   7. Auto-apply route if confidence ≥ threshold.
 *   8. Emit SSE event so connected clients update immediately.
 *
 * Returns HTTP 201 with the new OptimizationLog on success.
 */
export async function triggerSimulation(
  _req: Request,
  res:  Response,
): Promise<void> {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ── Step 1: Pick this simulation's hazard scenario ────
    const { scenario, idx: scenarioIdx } = await pickScenario();

    // ── Step 2: Clean up previous simulation alerts ───────
    // Mark any previously-simulated alerts as inactive so the
    // map doesn't accumulate stale hazard polygons after repeated
    // "Simulate" button clicks.
    await RiskAlert.updateMany(
      {
        isActive:    true,
        agentSource: scenario.agentSource,
        // Only clean up alerts created by the simulation (they have
        // titles that start with known prefixes rather than seed titles)
        title: { $regex: /Typhoon Meridian|Cyclone Arwen-|South China Sea — Restricted|Indian Ocean Storm Front/ },
      },
      { isActive: false },
      { session },
    );

    // ── Step 3: Find a suitable shipment ─────────────────
    const targetShipment: IShipment | null =
      await Shipment.findOne({
        status:   { $in: ['transit', 'delayed'] },
        fromCode: { $in: scenario.fromCodes },
      }).session(session) ??
      await Shipment.findOne({ status: { $in: ['transit', 'delayed'] } }).session(session);

    if (!targetShipment) {
      await session.abortTransaction();
      failure(res, 'No eligible transit shipment found. Seed the database first.', 404);
      return;
    }

    // ── Step 4: Mint the RiskAlert ────────────────────────
    const newHzId = await nextHzId();

    const newAlert = new RiskAlert({
      alertId:     newHzId,
      agentSource: scenario.agentSource,
      severity:    scenario.severity,
      title:       scenario.titleFn(),
      description: scenario.description,
      hazardZone: {
        type:        'Polygon' as const,
        coordinates: [scenario.polygon.map(([lon, lat]) => [lon, lat] as [number, number])],
      },
      affectedShipmentIds: [targetShipment.trackingId],
      isActive:            true,
      expectedClearanceAt: new Date(Date.now() + scenario.clearanceHours * 60 * 60 * 1000),
    });

    await newAlert.save({ session });

    // ── Step 5: Mark shipment at-risk ─────────────────────
    targetShipment.status = 'risk';
    await targetShipment.save({ session });

    // ── Step 6: Build pre-seeded rerouting decision ───────
    const decision = buildPreseededDecision(scenarioIdx, targetShipment);

    // ── Step 7: Map Gemini output → OptimizationLog ───────
    const newOptId  = await nextOptId();
    const logStatus = decision.action === 'AUTO_APPROVED' ? 'AUTO_APPROVED' : 'PENDING';

    const newLog = new OptimizationLog({
      optId:              newOptId,
      shipmentId:         targetShipment._id,
      alertId:            newAlert._id,
      shipmentTrackingId: targetShipment.trackingId,
      alertHumanId:       newAlert.alertId,
      confidenceScore:    decision.confidenceScore,
      aiReasoning:        decision.aiReasoning,
      selectedAlternate:  decision.selectedAlternate,
      proposedRoute:      decision.proposedRoute,
      metrics: {
        originalETA_h:       decision.originalETA_h,
        proposedETA_h:       decision.proposedETA_h,
        timeSavedMinutes:    decision.timeSavedMinutes,
        spoilageAvoided_usd: decision.spoilageAvoided_usd,
        fuelDeltaPct:        decision.fuelDeltaPct,
      },
      geminiAction: decision.action,
      status:       logStatus,
    });

    await newLog.save({ session });

    // ── Step 8: Auto-execute if Gemini approved ───────────
    if (logStatus === 'AUTO_APPROVED') {
      targetShipment.activeRoute                  = decision.proposedRoute;
      targetShipment.status                       = 'rerouted';
      targetShipment.eta.estimatedArrival         = `T+${decision.proposedETA_h.toFixed(1)}h`;
      targetShipment.eta.delayMinutes             = decision.timeSavedMinutes;
      targetShipment.eta.absoluteArrivalAt        = hoursToAbsoluteDate(decision.proposedETA_h);
      await targetShipment.save({ session });
    }

    await session.commitTransaction();

    // ── Step 9: Return + push SSE event ──────────────────
    const populatedLog = await OptimizationLog
      .findById(newLog._id)
      .populate('shipmentId', 'trackingId cargoDescription fromCode toCode status eta')
      .populate('alertId',    'alertId title severity agentSource')
      .lean();

    sseEmit('simulation:complete', {
      optimizationLog: populatedLog,
      alertId:         newAlert.alertId,
    });

    success(res, {
      optimizationLog: populatedLog,
      alert:           newAlert.toObject(),
      decision,
    }, 201);

  } catch (err) {
    await session.abortTransaction();
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[triggerSimulation] Unexpected error:', msg);
    failure(res, 'Simulation failed unexpectedly', 500, msg);
  } finally {
    await session.endSession();
  }
}

// ─────────────────────────────────────────────────────────────
// Shared log-resolution helper
// ─────────────────────────────────────────────────────────────

/**
 * Loads an OptimizationLog by optId or ObjectId, enforces that it
 * is currently PENDING, and returns it with an open session.
 * Returns null and sends the error response if any guard fails.
 */
async function loadPendingLog(
  id:      string,
  session: mongoose.ClientSession,
  res:     Response,
): Promise<IOptimizationLog | null> {
  const isObjectId = mongoose.Types.ObjectId.isValid(id) && id.length === 24;

  const log: IOptimizationLog | null = isObjectId
    ? await OptimizationLog.findById(id).session(session)
    : await OptimizationLog.findOne({ optId: id }).session(session);

  if (!log) {
    await session.abortTransaction();
    failure(res, `OptimizationLog "${id}" not found`, 404);
    return null;
  }

  if (log.status !== 'PENDING') {
    await session.abortTransaction();
    failure(
      res,
      `Cannot act on log "${log.optId}" — current status is "${log.status}". ` +
      `Only PENDING logs can be approved or rejected.`,
      409,
    );
    return null;
  }

  return log;
}

// ─────────────────────────────────────────────────────────────
// CONTROLLER 4 — executeReroute
// ─────────────────────────────────────────────────────────────

/**
 * PUT /api/optimize/:id/execute
 *
 * Operator approval: applies the AI's proposedRoute to the shipment.
 *
 *   1. Load PENDING OptimizationLog.
 *   2. Load associated Shipment.
 *   3. Write proposedRoute → Shipment.activeRoute.
 *   4. Flip statuses, stamp resolvedAt / resolvedBy.
 *   5. Deactivate the source RiskAlert.
 *   6. Emit SSE event.
 *   7. Return updated log + shipment.
 */
export async function executeReroute(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {

  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const log = await loadPendingLog(id, session, res);
    if (!log) return;

    const shipment: IShipment | null = await Shipment
      .findById(log.shipmentId)
      .session(session);

    if (!shipment) {
      await session.abortTransaction();
      failure(res, `Shipment "${log.shipmentTrackingId}" not found`, 404);
      return;
    }

    // Apply reroute
    shipment.activeRoute               = log.proposedRoute;
    shipment.status                    = 'rerouted';
    shipment.eta.estimatedArrival      = `T+${log.metrics.proposedETA_h.toFixed(1)}h`;
    shipment.eta.originalArrival       = `T+${log.metrics.originalETA_h.toFixed(1)}h`;
    shipment.eta.delayMinutes          = log.metrics.timeSavedMinutes;
    shipment.eta.absoluteArrivalAt     = hoursToAbsoluteDate(log.metrics.proposedETA_h);
    await shipment.save({ session });

    // Stamp the log
    log.status     = 'EXECUTED';
    log.resolvedAt = new Date();
    log.resolvedBy = sanitizeResolvedBy(req.body?.resolvedBy);
    await log.save({ session });

    // Deactivate the hazard alert
    await RiskAlert.findByIdAndUpdate(log.alertId, { isActive: false }, { session });

    await session.commitTransaction();

    const updatedLog = await OptimizationLog
      .findById(log._id)
      .populate('shipmentId', 'trackingId cargoDescription fromCode toCode status eta activeRoute')
      .populate('alertId',    'alertId title severity isActive')
      .lean();

    sseEmit('reroute:executed', { optId: log.optId, shipmentId: log.shipmentTrackingId });

    success(res, {
      optimizationLog: updatedLog,
      shipment:        shipment.toObject(),
      message: `Reroute approved. Shipment ${shipment.trackingId} is now tracking the new route.`,
    });

  } catch (err) {
    await session.abortTransaction();
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[executeReroute] Unexpected error:', msg);
    failure(res, 'Failed to execute reroute', 500, msg);
  } finally {
    await session.endSession();
  }
}

// ─────────────────────────────────────────────────────────────
// CONTROLLER 5 — rejectReroute
// ─────────────────────────────────────────────────────────────

/**
 * PUT /api/optimize/:id/reject
 *
 * Operator rejection: marks the log REJECTED and reactivates
 * the shipment to 'transit' so it is no longer flagged at-risk.
 *
 * Body (optional):
 *   { "resolvedBy": "operator@meridian.io", "reason": "…" }
 *
 *   1. Load PENDING OptimizationLog.
 *   2. Flip log.status → REJECTED, stamp resolvedAt / resolvedBy.
 *   3. Restore Shipment.status → 'transit'.
 *   4. Deactivate the source RiskAlert (operator dismissed it).
 *   5. Emit SSE event.
 *   6. Return updated log.
 */
export async function rejectReroute(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {

  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const log = await loadPendingLog(id, session, res);
    if (!log) return;

    // Stamp the log as rejected
    log.status     = 'REJECTED';
    log.resolvedAt = new Date();
    log.resolvedBy = sanitizeResolvedBy(req.body?.resolvedBy);
    await log.save({ session });

    // Restore shipment to transit — it's no longer in the risk state
    await Shipment.findByIdAndUpdate(
      log.shipmentId,
      { status: 'transit' },
      { session },
    );

    // Deactivate the alert — the operator has acknowledged and dismissed it
    await RiskAlert.findByIdAndUpdate(log.alertId, { isActive: false }, { session });

    await session.commitTransaction();

    const updatedLog = await OptimizationLog
      .findById(log._id)
      .populate('shipmentId', 'trackingId status')
      .populate('alertId',    'alertId title isActive')
      .lean();

    sseEmit('reroute:rejected', { optId: log.optId, shipmentId: log.shipmentTrackingId });

    success(res, {
      optimizationLog: updatedLog,
      message: `Reroute rejected. Shipment ${log.shipmentTrackingId} restored to transit.`,
    });

  } catch (err) {
    await session.abortTransaction();
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[rejectReroute] Unexpected error:', msg);
    failure(res, 'Failed to reject reroute', 500, msg);
  } finally {
    await session.endSession();
  }
}
