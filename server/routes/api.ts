/**
 * ============================================================
 * routes/api.ts
 * ============================================================
 * Defines the complete public API surface for Meridian.
 * This router is mounted at /api in server.ts.
 *
 * Endpoint map:
 * ┌──────────────────────────────────────────────────────────┐
 * │ Method  Path                       Controller            │
 * ├──────────────────────────────────────────────────────────┤
 * │ GET     /api/health                inline health check   │
 * │ GET     /api/map-state             getDashboardState     │
 * │ POST    /api/simulate              triggerSimulation     │
 * │ PUT     /api/optimize/:id/execute  executeReroute        │
 * └──────────────────────────────────────────────────────────┘
 * ============================================================
 */

import { Router, Request, Response } from 'express';

import {
  getDashboardState,
  triggerSimulation,
  executeReroute,
  rejectReroute,
  getKpis,
} from '../controllers/LogisticsController';
import { requireApiKey }    from '../middleware/auth';
import { simulateLimiter, apiLimiter } from '../middleware/rateLimiter';
import { registerClient }  from '../services/SseService';

const router = Router();

// ─────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/health
 *
 * Lightweight liveness probe — returns the server timestamp and
 * environment so the frontend can confirm the API is reachable
 * before attempting real requests.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok:          true,
    service:     'meridian-api',
    environment: process.env.NODE_ENV ?? 'development',
    timestamp:   new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// Dashboard / world map
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/map-state
 * Full world state: all shipments, active hazard polygons, and
 * the 20 most recent optimization logs for the Reasoning Panel.
 */
router.get('/map-state', apiLimiter, getDashboardState);

/**
 * GET /api/kpis
 * Live KPI aggregation computed from the shipment collection.
 */
router.get('/kpis', apiLimiter, getKpis);

/**
 * GET /api/events
 * Server-Sent Events stream. Clients subscribe once and receive
 * push notifications when simulations complete or reroutes are
 * executed/rejected — no more 30-second polling required.
 */
router.get('/events', (req: Request, res: Response) => {
  try {
    registerClient(req, res);
  } catch (err) {
    const details = err instanceof Error ? err.message : 'Unknown SSE error';
    console.error('[events] Failed to register SSE client:', details);
    res.status(200).json({ ok: true, data: { events: [], fallback: true } });
  }
});

// ─────────────────────────────────────────────────────────────
// AI simulation pipeline
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/simulate
 * Triggers the full multi-agent pipeline (Gemini call).
 * Protected by API key auth + tight rate limiter (5 / 10 min).
 */
router.post('/simulate', requireApiKey, simulateLimiter, triggerSimulation);

// ─────────────────────────────────────────────────────────────
// Operator approval / rejection
// ─────────────────────────────────────────────────────────────

/**
 * PUT /api/optimize/:id/execute
 * Executes a PENDING rerouting decision after operator approval.
 * :id — optId ("OPT-5001") or 24-char MongoDB ObjectId.
 * Body (optional): { "resolvedBy": "operator@meridian.io" }
 */
router.put('/optimize/:id/execute', requireApiKey, executeReroute);

/**
 * PUT /api/optimize/:id/reject
 * Rejects a PENDING rerouting decision.
 * :id — optId ("OPT-5001") or 24-char MongoDB ObjectId.
 * Body (optional): { "resolvedBy": "operator@meridian.io", "reason": "…" }
 */
router.put('/optimize/:id/reject', requireApiKey, rejectReroute);

export default router;
