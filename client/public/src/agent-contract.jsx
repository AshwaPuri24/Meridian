// ============================================================
// Meridian - frontend agent integration contract
// ============================================================
// UI-only contract for teammate-built agents. This file does not call
// backend services; it documents the payloads the existing screens can
// consume and exposes helpers on window for script-tag modules.

const MERIDIAN_AGENT_CONTRACT_VERSION = "ui-agent-contract-v1";

const MERIDIAN_AGENT_ROLES = {
  orchestrator: {
    label: "Orchestrator Agent",
    role: "Supervisor",
    owns: ["decision", "confidence", "impact", "humanApproval"],
    expectedStatus: "thinking | pending_approval | executed | monitoring",
  },
  weather: {
    label: "Weather Agent",
    role: "Meteorologist",
    owns: ["conditions", "officialAlerts", "coordinates"],
    expectedStatus: "idle | fetching | validated | unavailable",
  },
  intelligence: {
    label: "Intelligence Agent",
    role: "Scout",
    owns: ["newsSignals", "hazardExtraction", "riskAlertInjection"],
    expectedStatus: "scheduled | scanning | extracted | failed",
  },
  map: {
    label: "Map Agent",
    role: "Navigator",
    owns: ["roadDetours", "routeGeometry", "hazardAvoidance"],
    expectedStatus: "idle | calculating | proposed | unavailable",
  },
};

const MERIDIAN_AGENT_EVENT_SHAPES = {
  status: {
    type: "agent:status",
    agent: "orchestrator | weather | intelligence | map",
    status: "string",
    message: "string",
    shipmentId: "optional tracking id",
    createdAt: "ISO timestamp",
  },
  decision: {
    type: "agent:decision",
    optId: "optimization id",
    shipmentId: "tracking id",
    alertId: "hazard/risk alert id",
    confidenceScore: "0..1",
    action: "REQUIRES_HUMAN_SIGNOFF | AUTO_APPROVED | EXECUTED | REJECTED",
    metrics: "ETA/cost/time impact object",
    proposedRoute: "GeoJSON LineString",
  },
  hazard: {
    type: "agent:hazard",
    alertId: "risk alert id",
    sourceAgent: "weather | intelligence",
    severity: "LOW | MEDIUM | HIGH",
    affectedShipmentIds: "tracking id array",
    hazardZone: "GeoJSON Polygon",
  },
};

function normalizeMeridianAgentEvent(event = {}) {
  const createdAt = event.createdAt || new Date().toISOString();
  const agent = event.agent || event.sourceAgent || "orchestrator";
  return {
    type: event.type || "agent:status",
    agent,
    status: event.status || "monitoring",
    message: event.message || event.body || "",
    shipmentId: event.shipmentId || event.shipmentTrackingId || null,
    alertId: event.alertId || event.alertHumanId || null,
    createdAt,
    raw: event,
  };
}

Object.assign(window, {
  MERIDIAN_AGENT_CONTRACT_VERSION,
  MERIDIAN_AGENT_ROLES,
  MERIDIAN_AGENT_EVENT_SHAPES,
  normalizeMeridianAgentEvent,
});
