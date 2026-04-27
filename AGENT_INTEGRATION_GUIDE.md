# Meridian Agent Integration Guide

This guide is for the teammate implementing the four Meridian agents. It documents how to connect agent output to the existing app without changing the current UI contract.

## Current Rule

Do not bypass the existing backend models or frontend adapters. The UI already reads:

- `GET /api/map-state`
- `GET /api/kpis`
- `GET /api/events`
- `POST /api/simulate`
- `PUT /api/optimize/:id/execute`
- `PUT /api/optimize/:id/reject`

Agent work should create or update the same MongoDB documents the app already consumes: `Shipment`, `RiskAlert`, and `OptimizationLog`.

## Four Agents

### 1. Orchestrator Agent

Role: supervisor and decision maker.

Expected output:

- `OptimizationLog`
- confidence score from `0` to `1`
- selected alternate route id
- proposed route as GeoJSON `LineString`
- ETA, cost, fuel, and risk impact metrics
- lifecycle action: `AUTO_APPROVED`, `REQUIRES_HUMAN_SIGNOFF`, or `REJECT`

Frontend display:

- Overview hero card: Live AI Decisions
- Agent Reasoning drawer
- Shipment detail drawer timeline
- Global Map AI decision panel

### 2. Weather Agent

Role: deterministic meteorological validation.

Expected output:

- official conditions for requested coordinates
- severe weather alerts when available
- no guessed weather or hallucinated forecasts

Backend destination:

- contributes to Orchestrator input
- may create `RiskAlert` with `agentSource: "Weather"`

### 3. Intelligence Agent

Role: background disruption scout.

Expected output:

- extracted disruption type
- severity
- approximate hazard polygon
- affected region and possible shipment ids

Backend destination:

- creates `RiskAlert`
- use existing `agentSource` values until backend enums are expanded:
  - port strike or closure: `Geopolitical`
  - traffic or road disruption: `Traffic`
  - general/custom disruption: `Custom`

### 4. Map Agent

Role: navigator for physical routes, especially road journeys.

Expected output:

- proposed alternate route as dense GeoJSON `LineString`
- route summary and avoid-zone explanation
- Google Maps Directions API response should be normalized before storage

Backend destination:

- contributes route geometry to `OptimizationLog.proposedRoute`
- road-only detours should avoid hazard bounding boxes

## Frontend Contract

The browser exposes these globals from `client/public/src/agent-contract.jsx`:

```js
window.MERIDIAN_AGENT_CONTRACT_VERSION
window.MERIDIAN_AGENT_ROLES
window.MERIDIAN_AGENT_EVENT_SHAPES
window.normalizeMeridianAgentEvent(event)
```

These are UI helpers only. They do not call the backend.

Agent names used by the UI:

```txt
orchestrator
weather
intelligence
map
```

Legacy names still render for compatibility:

```txt
risk -> Intelligence Agent
route -> Map Agent
```

## RiskAlert Shape

The frontend adapter expects backend `RiskAlert` documents with:

```ts
{
  alertId: "HZ-021",
  agentSource: "Weather" | "Traffic" | "Geopolitical" | "Custom",
  severity: "Low" | "Medium" | "High" | "Critical",
  title: string,
  description: string,
  hazardZone: {
    type: "Polygon",
    coordinates: number[][][]
  },
  affectedShipmentIds: string[],
  isActive: boolean,
  expectedClearanceAt: Date | null
}
```

Important: polygon rings must be closed. The first coordinate must equal the last coordinate.

## OptimizationLog Shape

The frontend adapter expects:

```ts
{
  optId: "OPT-4921",
  shipmentTrackingId: "MRD-48271",
  alertHumanId: "HZ-021",
  confidenceScore: 0.94,
  aiReasoning: string,
  selectedAlternate: "ALT-A",
  proposedRoute: {
    type: "LineString",
    coordinates: number[][]
  },
  metrics: {
    originalETA_h: number,
    proposedETA_h: number,
    timeSavedMinutes: number,
    spoilageAvoided_usd?: number,
    fuelDeltaPct?: number
  },
  geminiAction: "AUTO_APPROVED" | "REQUIRES_HUMAN_SIGNOFF" | "REJECT",
  status: "PENDING" | "AUTO_APPROVED" | "EXECUTED" | "REJECTED"
}
```

## UI Flow After Agent Integration

1. Intelligence or Weather Agent creates a `RiskAlert`.
2. Orchestrator evaluates affected shipments.
3. Weather Agent validates live conditions for route coordinates.
4. Map Agent returns physical detours for road shipments.
5. Orchestrator writes an `OptimizationLog`.
6. Frontend receives it through `/api/map-state` or `/api/events`.
7. Operator approves/rejects from Agent Reasoning or shipment detail.
8. Existing backend execute/reject endpoints update shipment state.

## Acceptance Checklist

- `GET /api/map-state` returns the new alert and optimization log.
- Overview shows a matching alert and AI decision.
- Agent Reasoning shows the trace with four agent roles.
- Shipment detail drawer shows the proposed action and route impact.
- Global Map highlights the impacted shipment or fallback route.
- `PUT /api/optimize/:id/execute` works for pending decisions.
- `PUT /api/optimize/:id/reject` works for pending decisions.
- No frontend code changes are needed when agents write the documented shapes.

