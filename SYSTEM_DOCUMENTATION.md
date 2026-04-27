# Meridian — Multi-Agent Predictive Logistics Platform

> **Google Solution Challenge 2026** — "Build with AI" Track  
> **Version:** 1.0.0  
> **Status:** Production-Ready Demo

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [End-to-End Workflow](#2-end-to-end-workflow)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Backend Architecture](#4-backend-architecture)
5. [Data Flow](#5-data-flow)
6. [Features — All Screens](#6-features--all-screens)
7. [Tech Stack](#7-tech-stack)
8. [APIs and Integrations](#8-apis-and-integrations)
9. [System Design](#9-system-design-high-level)
10. [Limitations](#10-limitations)
11. [Future Improvements](#11-future-improvements)

---

## 1. Product Overview

### What is Meridian?

Meridian is an AI-powered supply chain command center that transforms reactive logistics management into a **predictive, autonomous operation**. It deploys a swarm of specialized AI agents that continuously monitor global shipment routes, detect emerging hazards (weather events, traffic disruptions, geopolitical closures), and automatically calculate optimal rerouting decisions — **before delays cascade into cargo loss**.

### The Problem

Traditional logistics platforms are **reactive**: they alert operators after a shipment is already delayed. By then, options are limited and cargo damage is often unavoidable. For time-sensitive shipments (pharmaceuticals, perishables, high-value electronics), a 6-hour delay can mean six-figure losses.

### What Meridian Solves

| Before Meridian | With Meridian |
|-----------------|---------------|
| Alerts fire after delays occur | Hazards detected 6–48h before impact |
| Manual reroute evaluation (2–4 hours) | AI-generated reroutes in <2 seconds |
| Human-only decision making | Auto-approved reroutes for 84%+ confidence scenarios |
| Static route planning | Continuous real-time route optimization |
| Siloed visibility (weather, traffic, fleet) | Unified multi-agent situational awareness |

### Target Users

1. **Logistics Operations Managers** — Oversee 100–10,000 active shipments; need instant visibility into at-risk cargo.
2. **Supply Chain Directors** — Require predictive analytics to justify proactive rerouting costs to executives.
3. **Emergency Response Teams** — Need rapid scenario simulation for crisis decision-making.

### Differentiators

- **Multi-Agent Architecture**: Not a single monolithic AI. Meridian uses specialized agents (Weather, Risk, Routing, Orchestrator) that collaborate like a human operations team.
- **Confidence-Driven Autogating**: Reroutes with ≥87% confidence execute automatically; lower-confidence decisions route to human operators.
- **Pre-Seeded Decision Engine**: For demo/staging environments, Meridian can operate without live AI API calls by using pre-computed optimal reroutes for known hazard scenarios.
- **Mode-Aware Routing**: The system understands physical constraints of OCEAN, AIR, ROAD, and RAIL transport — trucks follow highways, trains cannot detour, ships/aircraft have free-space routing.

---

## 2. End-to-End Workflow

### Step 1: Data Ingestion

**Input Sources:**
- MongoDB Atlas stores shipment state (position, route, ETA, cargo type)
- External hazard feeds (simulated in demo; production integrates weather APIs, traffic APIs, geopolitical risk feeds)
- Google Maps API for road/rail network data

**Data Model:**
```typescript
Shipment {
  trackingId:       string;      // e.g., "MRD-48244"
  cargoDescription: string;
  transportMode:    "OCEAN" | "AIR" | "ROAD" | "RAIL";
  origin:           GeoJSON Point;
  destination:      GeoJSON Point;
  currentLocation:  GeoJSON Point;
  activeRoute:      GeoJSON LineString;
  status:           "transit" | "risk" | "delayed" | "rerouted" | "delivered";
  eta:              { estimatedArrival: string; delayMinutes: number; };
  vehicleConstraints: { maxWeight: number; requiresColdChain: boolean; };
}
```

### Step 2: Risk Detection

**Trigger:** `POST /api/simulate` (demo) or external webhook (production)

**Process:**
1. System selects a hazard scenario from a rotating pool (North Pacific Typhoon, Arabian Sea Cyclone, South China Sea Closure, Indian Ocean Storm)
2. Identifies shipments whose origin codes intersect the hazard zone
3. Creates a `RiskAlert` document with:
   - Hazard polygon (GeoJSON)
   - Severity rating (High / Critical)
   - Expected clearance time
   - List of affected shipment IDs

**Output:**
```typescript
RiskAlert {
  alertId:             string;     // "HZ-0042"
  agentSource:         "Weather" | "Traffic" | "Geopolitical";
  severity:            "High" | "Critical";
  title:               string;
  description:         string;
  hazardZone:          GeoJSON Polygon;
  affectedShipmentIds: string[];
  isActive:            boolean;
  expectedClearanceAt: Date;
}
```

### Step 3: AI Reasoning (Orchestrator Agent)

**Mode:** Live Gemini (production) or Pre-Seeded (demo)

**Live Mode:**
1. Shipment + Hazard documents serialized to JSON
2. Sent to Google Gemini 2.0 Flash via LangChain
3. StructuredOutputParser enforces Zod schema validation
4. Model returns typed decision with:
   - Selected alternate route
   - Confidence score (0.0–1.0)
   - Reasoning narrative
   - Proposed route coordinates
   - ETA delta metrics
   - Spoilage/fuel impact estimates

**Pre-Seeded Mode (Demo):**
```typescript
function buildPreseededDecision(scenarioIdx, shipment): OrchestratorOutput {
  // Returns hardcoded optimal detour for known scenario
  // Confidence: 0.87–0.96 (all AUTO_APPROVED)
  // Routes: geographic waypoints that bypass hazard polygon
}
```

### Step 4: Decision Validation & Persistence

**Validation Rules:**
- Confidence ≥ 0.85 + non-critical cargo → `AUTO_APPROVED`
- Confidence < 0.85 OR pharma/cold-chain/high-value → `REQUIRES_HUMAN_SIGNOFF`
- RAIL transport + no viable detour → `haltRequired: true` (train must stop)

**Persistence:**
```typescript
OptimizationLog {
  optId:              string;      // "OPT-00521"
  shipmentId:         ObjectId;
  alertId:            ObjectId;
  confidenceScore:    number;
  aiReasoning:        string;
  selectedAlternate:  string;
  proposedRoute:      GeoJSON LineString;
  metrics: {
    originalETA_h:    number;
    proposedETA_h:    number;
    timeSavedMinutes: number;
    spoilageAvoided_usd: number;
    fuelDeltaPct:     number;
  };
  geminiAction:       "AUTO_APPROVED" | "REQUIRES_HUMAN_SIGNOFF" | "PENDING";
  status:             "PENDING" | "AUTO_APPROVED" | "EXECUTED" | "REJECTED";
}
```

### Step 5: Auto-Execution (if approved)

**Auto-Approved Path:**
1. Shipment `activeRoute` ← `proposedRoute`
2. Shipment `status` ← `"rerouted"`
3. Shipment `eta` updated with new arrival time
4. RiskAlert marked `isActive: false`
5. SSE event emitted: `simulation:complete`

**Human Approval Required:**
1. Decision appears in "LIVE AI DECISIONS" queue
2. Operator clicks "Approve" → executes same flow as auto-approved
3. Operator clicks "Reject" → shipment restored to `"transit"`, alert dismissed

### Step 6: User Interaction

**Frontend Updates:**
- Dashboard KPIs refresh (on-time %, at-risk count, rerouted today)
- World Map highlights affected shipment routes
- "Agent Activity" view streams reasoning steps
- Active Shipments table shows updated status badges

---

## 3. Frontend Architecture

### Framework

- **React 19** (CDN-loaded, no build step for demo)
- **Vite 5.4** (dev server + production bundler)
- **Browser Babel** (in-browser JSX transpilation)
- **Vanilla CSS** (CSS variables for theming)

**Rationale:** Zero-build setup enables rapid iteration and demo deployment without CI/CD complexity. Production build available via `npm run build`.

### Component Structure

```
client/public/src/
├── app.jsx              # Root component, state orchestration, polling
├── dashboard.jsx        # KPI strip, AI decisions hero, shipments table
├── globalmap.jsx        # Google Maps integration, route visualization
├── map.jsx              # Legacy SVG world map (fallback)
├── panels.jsx           # Reasoning panel, agent activity stream
├── detail.jsx           # Shipment detail drawer
├── agents.jsx           # Multi-agent workflow visualization
├── AIActionBanner.jsx   # Predictive alert banner
├── api.jsx              # MeridianAPI client adapter
├── data.jsx             # Static fallback data
└── icons.jsx            # Icon library (12px–18px system)
```

### Key Components

#### 3.1 `app.jsx` — Application Root

**Responsibilities:**
- Mounts initial data (`/api/map-state`, `/api/kpis`)
- Manages 10-second polling loop (replaces SSE for demo reliability)
- Handles simulation trigger (`POST /api/simulate`)
- Routes approve/reject actions to backend
- Manages view state (`overview`, `globalmap`, `agents`)
- Applies theme/density preferences to `<html>`

**State Management:**
```jsx
const [kpis, setKpis]         = React.useState(null);      // Live KPIs from API
const [entries, setEntries]   = React.useState(window.REASONING); // Agent decisions
const [refreshKey, setRefreshKey] = React.useState(0);     // Forces map re-render
const [view, setView]         = React.useState("overview"); // View router
```

**Polling Logic:**
```jsx
React.useEffect(() => {
  const id = setInterval(async () => {
    const data = await window.MeridianAPI.getMapState();
    applyLiveData(data); // Immutable merge into shipments/alerts/logs
  }, 10_000);
  return () => clearInterval(id);
}, []);
```

#### 3.2 `dashboard.jsx` — Operations Dashboard

**Sections:**

**1. KPI Strip (`DashKpiStrip`)**
- **On-Time %**: Percentage of shipments not delayed
- **At Risk**: Count of shipments in hazard zones
- **Rerouted Today**: AI-executed reroutes in last 24h
- Each card includes sparkline trend (12 data points)

**2. Predictive Alert Card (`PredictiveAlertCard`)**
- Lists top 3 imminent hazards
- Shows shipment ID, time-to-impact, hazard type
- "View Impact" → expands map to affected region
- "Simulate" → triggers hazard scenario

**3. Global Route Monitor (`GlobalRouteMonitor`)**
- Embedded mini-map showing all active shipments
- Click to expand full-screen map
- Shows hazard overlays, route polylines

**4. LIVE AI DECISIONS (`LiveAiDecisions`)**
- Hero section displaying agent swarm activity
- Each decision row shows:
  - Shipment ID + transport mode icon
  - Signal source (Weather/Risk/Route agent)
  - Resolution (reroute proposal)
  - Confidence bar (color-coded: green ≥90%, violet ≥80%, warn <80%)
  - Action buttons (Approve/Reject for PENDING status)

**5. Active Shipments Table (`ActiveShipmentsTable`)**
- Columns: ID, Destination, Status, ETA, Risk Level, AI Decision Flow, Progress, Action
- `shipmentToRow()` adapter transforms API data → table shape
- Status badges: In Transit (ok), At Risk (alert), Delayed (warn), Rerouted (violet)

#### 3.3 `globalmap.jsx` — Global Map Monitoring

**Features:**
- Google Maps API integration (dark theme custom style)
- Interactive route polylines (click to select, hover to highlight)
- Hazard zone circles with ripple animation
- Floating route card (appears on route click)
- Layer controls (Hazards, Traffic, Weather, AI Routes toggles)
- AI Decision panel (right sidebar)

**Map Initialization:**
```jsx
const map = new google.maps.Map(mapRef.current, {
  center: { lat: 20, lng: 10 },
  zoom: 2,
  styles: DARK_MAP_STYLE, // Custom dark theme JSON
  disableDefaultUI: true,
  zoomControl: true,
});
```

**Route Rendering:**
- Great-circle arc calculation for realistic long-haul paths
- Dashed lines for "rerouted" status
- Vehicle markers at route midpoints
- Click handlers → floating card with ETA, risk, confidence

#### 3.4 `agents.jsx` — AI Control Center

**Purpose:** Visualize multi-agent reasoning workflow

**Agent Steps Displayed:**
1. **Weather Agent** — Detects hazard, publishes severity
2. **Risk Agent** — Evaluates cargo impact probability
3. **Routing Agent** — Computes alternate paths
4. **Orchestrator** — Synthesizes inputs, makes final decision

**UI Elements:**
- Streaming indicator ("LIVE" badge pulses)
- Message throughput KPI (14,223 msgs/hr)
- Average latency (1.52s)
- Auto-approve rate (84.6%)
- Search bar (filter by agent/shipment)

### State Management Approach

**Pattern:** Local React state + window globals for legacy compatibility

**Why:** Demo uses CDN React without bundler; avoids prop-drilling complexity across 12+ components.

**Data Flow:**
```
app.jsx (root state)
  ↓ props
dashboard.jsx, globalmap.jsx, agents.jsx
  ↓ immutable updates via applyLiveData()
window.SHIPMENTS, window.HAZARDS, window.REASONING
```

**Theme System:**
```jsx
root.setAttribute("data-theme", tweaks.theme);   // "light" | "dark"
root.setAttribute("data-accent", tweaks.accent); // "blue" | "violet" | "emerald"
root.setAttribute("data-density", tweaks.density); // "compact" | "comfortable"
```

### Styling System

**CSS Variables:**
```css
:root {
  --bg-0: #030712;      /* App background */
  --bg-1: #0f1420;      /* Card background */
  --fg-0: #f8fafc;      /* Primary text */
  --fg-1: #94a3b8;      /* Secondary text */
  --ok: #22c55e;        /* Success green */
  --alert: #ef4444;     /* Error red */
  --warn: #f59e0b;      /* Warning amber */
  --violet: #8b5cf6;    /* AI accent */
  --accent: #3b82f6;    /* Primary brand blue */
}
```

**Dark/Light Theme:** Toggled via `data-theme` attribute; all colors are CSS variable references.

---

## 4. Backend Architecture

### Server Setup

**Runtime:** Node.js 18+  
**Framework:** Express 4.x  
**Language:** TypeScript 5.x (tsx runtime)  
**Database:** MongoDB Atlas (Mongoose 8.x ORM)

**Entry Point:** `server/server.ts`

```typescript
// Step 1: Preload .env (MUST be first import)
import './config/env';

// Step 2: Force Google DNS for SRV lookups
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Step 3: Initialize Express + MongoDB
const app = express();
await mongoose.connect(MONGODB_URI);
```

**Middleware Stack:**
1. CORS (permissive in dev, locked to `CORS_ORIGIN` in prod)
2. JSON body parser (1MB limit)
3. URL-encoded parser
4. Request logger (dev-only, timestamps requests)

### API Routes

Mounted at `/api/*` via `server/routes/api.ts`:

| Method | Endpoint | Controller | Description |
|--------|----------|------------|-------------|
| `GET` | `/health` | — | Liveness check (returns `{ service: "Meridian API" }`) |
| `GET` | `/map-state` | `getDashboardState` | Full world state (shipments, alerts, logs) |
| `GET` | `/kpis` | `getKpis` | Aggregated KPI metrics |
| `POST` | `/simulate` | `triggerSimulation` | Trigger hazard scenario + AI reroute |
| `PUT` | `/optimize/:id/execute` | `executeReroute` | Approve pending reroute |
| `PUT` | `/optimize/:id/reject` | `rejectReroute` | Reject pending reroute |
| `GET` | `/events` | `sseEmit` | Server-Sent Events stream (future) |

### Controllers

#### 4.1 `LogisticsController.ts`

**Functions:**

**`getDashboardState()`**
```typescript
GET /api/map-state
Returns: { shipments: IShipment[], alerts: IRiskAlert[], optimizations: IOptimizationLog[] }
```
- Fetches all shipments, active alerts, recent optimization logs
- Sorted by `createdAt DESC`, limited to 20 logs

**`getKpis()`**
```typescript
GET /api/kpis
Returns: { activeShipments, onTime: %, atRisk, reroutedToday, timeSavedHrs, costSaved }
```
- Aggregates counts from MongoDB
- Computes time saved from `metrics.timeSavedMinutes` (negative = faster)
- Cost saved from `metrics.spoilageAvoided_usd`

**`triggerSimulation()`**
```typescript
POST /api/simulate
Returns: 201 { optimizationLog, alert, decision }
```
- Picks scenario via round-robin (`pickScenario()`)
- Deactivates prior simulation alerts
- Mints new `RiskAlert` with hazard polygon
- Calls `buildPreseededDecision()` (demo) or `evaluateReroute()` (live)
- Auto-executes if confidence ≥ 0.87
- Emits SSE event `simulation:complete`

**`executeReroute()`**
```typescript
PUT /api/optimize/:id/execute
Body: { resolvedBy: "operator@company.com" }
```
- Loads pending `OptimizationLog`
- Updates shipment route, status, ETA
- Deactivates associated `RiskAlert`
- Emits SSE event `reroute:executed`

**`rejectReroute()`**
```typescript
PUT /api/optimize/:id/reject
```
- Marks log `REJECTED`
- Restores shipment to `"transit"`
- Deactivates alert

### Services

#### 4.2 `OrchestratorAgent.ts` — AI Reasoning Engine

**Purpose:** Invoke Gemini 2.0 Flash to generate validated rerouting decisions

**Chain Architecture:**
```
ChatPromptTemplate → ChatGoogleGenerativeAI → StructuredOutputParser<Zod>
```

**Zod Schema (Output Contract):**
```typescript
const OrchestratorOutputSchema = z.object({
  selectedAlternate:   z.string().min(1),
  confidenceScore:     z.number().min(0).max(1),
  aiReasoning:         z.string().min(20),
  proposedRoute:       z.object({ type: z.literal('LineString'), coordinates: z.array(z.tuple([z.number(), z.number()])) }),
  originalETA_h:       z.number().min(0),
  proposedETA_h:       z.number().min(0),
  timeSavedMinutes:    z.number(),
  spoilageAvoided_usd: z.number().min(0).default(0),
  fuelDeltaPct:        z.number().default(0),
  action:              z.enum(['AUTO_APPROVED', 'REQUIRES_HUMAN_SIGNOFF']),
  haltRequired:        z.boolean().default(false),
});
```

**Prompt Structure:**
- **System Message:** Establishes role, mode-specific constraints (OCEAN/AIR free-space, ROAD highway-constrained, RAIL halt-only)
- **Human Message:** Serialized shipment + hazard JSON
- **Format Instructions:** Auto-injected from Zod schema

**Post-Processing:**
- **ROAD shipments:** Calls `calculateRoadDetour()` (Google Maps Directions API) to replace Gemini waypoints with real highway polyline
- **RAIL + halt:** Pins route to current location, forces `REQUIRES_HUMAN_SIGNOFF`
- **OCEAN/AIR:** Passes through Gemini coordinates unchanged

#### 4.3 `GoogleMapsService.ts` — Physical Network Router

**Function:** `calculateRoadDetour(origin, destination, hazardPolygon)`

**Process:**
1. Computes midpoint of hazard polygon
2. Generates waypoint north/south of hazard based on origin-destination bearing
3. Calls Google Maps Directions API: `origin → waypoint → destination`
4. Extracts polyline, decodes to `[lon, lat]` array
5. Returns GeoJSON `LineString`

**Error Handling:** `GoogleMapsServiceError` wraps API failures; caller falls back to Gemini's placeholder route.

#### 4.4 `SseService.ts` — Real-Time Event Emitter

**Current State:** Stubbed for demo (frontend uses polling)

**Intended Use:**
```typescript
sseEmit('simulation:complete', { optimizationLog, alertId });
// Frontend EventSource receives:
// event: simulation:complete
// data: {"optimizationLog": {...}, "alertId": "HZ-0042"}
```

### Models (Mongoose Schemas)

#### `Shipment.ts`
```typescript
{
  trackingId: { type: String, unique: true },
  cargoDescription: String,
  transportMode: { type: String, enum: ['OCEAN', 'AIR', 'ROAD', 'RAIL'] },
  origin: { type: { type: String, enum: 'Point' }, coordinates: [Number] },
  destination: { type: { type: 'Point' }, coordinates: [Number] },
  currentLocation: { type: 'Point', coordinates: [Number] },
  activeRoute: { type: 'LineString', coordinates: [[Number]] },
  status: { type: String, enum: ['transit', 'risk', 'delayed', 'rerouted', 'delivered'] },
  eta: { estimatedArrival: String, delayMinutes: Number, absoluteArrivalAt: Date },
  vehicleConstraints: { maxWeight: Number, requiresColdChain: Boolean, hazmatClass: String },
}
```

#### `RiskAlert.ts`
```typescript
{
  alertId: { type: String, unique: true },
  agentSource: String,
  severity: { type: String, enum: ['High', 'Critical'] },
  title: String,
  description: String,
  hazardZone: { type: 'Polygon', coordinates: [[[Number]]] },
  affectedShipmentIds: [String],
  isActive: Boolean,
  expectedClearanceAt: Date,
}
```

#### `OptimizationLog.ts`
```typescript
{
  optId: { type: String, unique: true },
  shipmentId: { type: ObjectId, ref: 'Shipment' },
  alertId: { type: ObjectId, ref: 'RiskAlert' },
  confidenceScore: Number,
  aiReasoning: String,
  selectedAlternate: String,
  proposedRoute: { type: 'LineString', coordinates: [[Number]] },
  metrics: { originalETA_h, proposedETA_h, timeSavedMinutes, spoilageAvoided_usd, fuelDeltaPct },
  geminiAction: { type: String, enum: ['AUTO_APPROVED', 'REQUIRES_HUMAN_SIGNOFF', 'PENDING'] },
  status: { type: String, enum: ['PENDING', 'AUTO_APPROVED', 'EXECUTED', 'REJECTED'] },
  resolvedAt: Date,
  resolvedBy: String,
}
```

---

## 5. Data Flow

### Full Request-Response Cycle

```
┌─────────────┐
│   User      │
│  (Browser)  │
└──────┬──────┘
       │ 1. Click "Simulate Disruption"
       ▼
┌─────────────────────────────────────────────────────────┐
│  app.jsx (Frontend Root)                                │
│  - simulate() calls window.MeridianAPI.simulate()       │
│  - Starts simulation step animation                     │
└──────┬──────────────────────────────────────────────────┘
       │ 2. POST /api/simulate
       ▼
┌─────────────────────────────────────────────────────────┐
│  LogisticsController.triggerSimulation()                │
│  - Picks scenario (round-robin)                         │
│  - Creates RiskAlert (hazard polygon)                   │
│  - Calls buildPreseededDecision(scenarioIdx, shipment)  │
│  - Creates OptimizationLog                              │
│  - Auto-executes if confidence ≥ 0.87                   │
│  - Emits sseEmit('simulation:complete')                 │
└──────┬──────────────────────────────────────────────────┘
       │ 3. HTTP 201 { optimizationLog, alert, decision }
       ▼
┌─────────────────────────────────────────────────────────┐
│  app.jsx applyLiveData()                                │
│  - Merges shipment/alert/log into window.SHIPMENTS      │
│  - Updates React state (entries, refreshKey)            │
│  - Advances simulation step to "Reroute Applied"        │
└──────┬──────────────────────────────────────────────────┘
       │ 4. Props flow down
       ▼
┌─────────────────────────────────────────────────────────┐
│  dashboard.jsx                                          │
│  - DashKpiStrip: recomputes KPIs from live data         │
│  - LiveAiDecisions: inserts new decision row            │
│  - ActiveShipmentsTable: updates status badges          │
└─────────────────────────────────────────────────────────┘
```

### Map Update Flow

```
1. User clicks route on globalmap.jsx
   ↓
2. Google Maps click event → setSelectedRouteId(route.id)
   ↓
3. Floating card appears at click coordinates
   ↓
4. highlightFn.current(route.id) brightens selected route
   ↓
5. Unselected routes dim (strokeOpacity: 0.22)
```

### Decision Queue Flow

```
1. Backend creates OptimizationLog with status: "PENDING"
   ↓
2. Frontend polling (10s) fetches /api/map-state
   ↓
3. applyLiveData() prepends log to entries state
   ↓
4. LiveAiDecisions component renders new row
   ↓
5. User clicks "Approve" → PUT /api/optimize/:id/execute
   ↓
6. Backend updates log.status → "EXECUTED"
   ↓
7. Next poll cycle updates UI (row turns green, "Optimised & Executed")
```

---

## 6. Features — All Screens

### 6.1 Dashboard (`view === "overview"`)

**Purpose:** Command center for logistics operations

**Sections:**

#### KPI Strip
- **On-Time %**: Percentage of shipments not delayed (target: ≥95%)
- **At Risk**: Count of shipments in active hazard zones
- **Rerouted Today**: AI-executed reroutes in last 24 hours
- **Visual:** Sparkline trends (12 data points), color-coded deltas

#### Predictive Alert Card
- **Purpose:** Surface imminent threats requiring attention
- **Content:** Top 3 hazards with shipment IDs, time-to-impact, hazard type
- **Actions:** "View Impact" (expand map), "Simulate" (trigger scenario)

#### Global Route Monitor
- **Purpose:** Mini-map overview of entire fleet
- **Content:** All active shipments as polylines, hazard overlays
- **Interaction:** Click to expand full-screen map

#### LIVE AI DECISIONS (Hero Section)
- **Purpose:** Display real-time agent swarm activity
- **Content per Row:**
  - Shipment ID + transport icon (Ship/Truck/Pulse for Air)
  - Signal source (Weather/Risk/Route agent badge)
  - Resolution (e.g., "Reroute proposal · Port → Air")
  - Confidence bar (0–100%, color-coded)
  - Analysis narrative (plain English explanation)
  - Action buttons (Approve/Reject for PENDING status)

#### Active Shipments Table
- **Columns:** ID, Destination, Status, ETA, Risk Level, AI Decision Flow, Progress, Action
- **Status Badges:** In Transit (green), At Risk (red), Delayed (amber), Rerouted (violet)
- **Progress Bar:** Animated fill (0–100%)
- **AI Decision Flow:** Brain icon → arrow → decision label

---

### 6.2 Global Map (`view === "globalmap"`)

**Purpose:** Geographic monitoring of shipments and hazards

**Features:**

#### Interactive Routes
- **Rendering:** Great-circle arc polylines (80-step interpolation)
- **Styling:**
  - Active: cyan solid line
  - Rerouted: amber dashed line
  - Delayed: red solid line
- **Interaction:**
  - Click → select route, show floating card
  - Hover → brighten stroke
  - No selection → all routes at 0.82 opacity

#### Hazard Zones
- **Rendering:** Google Maps Circle overlays (outer ring + inner fill + animated ripple)
- **Animation:** Ripple expands 1.55× radius over 4 seconds, loops
- **Click:** Show hazard tooltip (severity, impacted ships, status)

#### Floating Route Card
- **Position:** Appears at click coordinates (clamped to viewport)
- **Content:**
  - Shipment ID, status badge
  - Route label (origin → destination)
  - Grid: ETA, Risk, Confidence, Progress
  - Confidence bar (horizontal fill)
  - Actions: Approve, Simulate, Details

#### Layer Controls (Left Panel)
- **Toggles:** Hazards, Traffic, Weather, AI Routes
- **Icons:** Alert, Layers, Temp, Route
- **Visual:** Toggle glows in layer color when active

#### AI Decision Panel (Right Panel)
- **Content:**
  - Selected shipment reference
  - Confidence score (large percentage + bar)
  - Key reasons (bullet list)
  - Agent workflow (4-step vertical timeline)
  - Actions: Approve, Override, Simulate

---

### 6.3 Simulation Lab (Triggered via "Simulate" button)

**Purpose:** Demonstrate end-to-end hazard response

**Flow:**
1. User clicks "Simulate Disruption"
2. Frontend animation: 4-step progress indicator
   - Step 0: "Hazard detected" (0ms)
   - Step 1: "Route affected" (900ms)
   - Step 2: "AI calculates reroute" (1900ms)
   - Step 3: "Reroute applied" (2200ms)
3. Backend creates RiskAlert + OptimizationLog
4. Dashboard updates:
   - New hazard appears in Predictive Alert Card
   - Shipment status changes to "At Risk"
   - Decision row appears in LIVE AI DECISIONS

**Scenarios (Rotating):**
- North Pacific Typhoon (affects PVG/NRT/SIN/HKG origins)
- Arabian Sea Cyclone (affects FRA/DXB/IST origins)
- South China Sea Geopolitical Closure (affects SIN/HKG/PVG origins)
- Indian Ocean Storm Front (affects SIN/BLR/BOM origins)

---

### 6.4 AI Control Center (`view === "agents"`)

**Purpose:** Visualize multi-agent reasoning workflow

**Header KPIs:**
- Messages/hour (14,223)
- Average latency (1.52s)
- Auto-approve rate (84.6%)

**Agent Workflow Timeline:**
1. **Weather Agent** — "Hurricane Beatriz · Category 2 · heading N-NW"
2. **Risk Agent** — "Cargo is temperature-critical; spoilage p=0.92"
3. **Routing Agent** — "Evaluating 3 alternates…"
4. **Orchestrator** — "Awaiting operator approval…"

**Visual Indicators:**
- Streaming badge (pulsing red dot)
- "Typing…" animation for active agent
- Checkmarks for completed steps

---

### 6.5 Shipment Detail Drawer

**Trigger:** Click shipment row or route on map

**Content:**
- Shipment metadata (ID, cargo, origin → destination)
- Current location (coordinates + map pin)
- Active route (polyline on embedded map)
- ETA timeline (original vs proposed)
- Associated optimization logs (if any)
- Actions: Execute Reroute, View History

---

## 7. Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.0.0 | UI framework |
| Vite | 5.4.0 | Dev server + bundler |
| Babel (CDN) | 7.x | In-browser JSX transpilation |
| CSS3 | — | Styling (CSS variables, flexbox, grid) |
| Google Maps JavaScript API | 3.x | Interactive map rendering |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime |
| TypeScript | 5.x | Type-safe JavaScript |
| tsx | 4.x | TypeScript runtime (ESM support) |
| Express | 4.x | HTTP server |
| Mongoose | 8.x | MongoDB ODM |
| MongoDB Atlas | — | Cloud database |
| LangChain | 0.3.x | AI orchestration framework |
| @langchain/google-genai | — | Gemini model adapter |
| Zod | 3.x | Runtime type validation |
| dotenv | — | Environment variable loading |
| cors | — | CORS middleware |
| dns (builtin) | — | DNS override for SRV lookups |

### AI/ML

| Technology | Version | Purpose |
|------------|---------|---------|
| Google Gemini 2.0 Flash | — | Primary reasoning model |
| LangChain StructuredOutputParser | — | Zod schema enforcement |
| ChatPromptTemplate | — | Prompt construction |
| RunnableSequence (LCEL) | — | Chain composition |

### DevOps

| Technology | Purpose |
|------------|---------|
| concurrently | Run server + client in parallel |
| npm scripts | Dev, build, seed, start commands |
| .env | Environment configuration (not committed) |

---

## 8. APIs and Integrations

### Internal API (Express)

#### `GET /api/health`
**Response:**
```json
{ "service": "Meridian API", "status": "ok" }
```

#### `GET /api/map-state`
**Response:**
```json
{
  "shipments": [...IShipment],
  "alerts": [...IRiskAlert],
  "optimizations": [...IOptimizationLog]
}
```

#### `GET /api/kpis`
**Response:**
```json
{
  "activeShipments": 2847,
  "onTime": 96.4,
  "atRisk": 14,
  "reroutedToday": 210,
  "timeSavedHrs": 48.5,
  "costSaved": "$125.4k"
}
```

#### `POST /api/simulate`
**Request:** `{}` (no body)  
**Response:**
```json
{
  "optimizationLog": { ... },
  "alert": { ... },
  "decision": { ... }
}
```

#### `PUT /api/optimize/:id/execute`
**Request:**
```json
{ "resolvedBy": "operator@company.com" }
```
**Response:**
```json
{
  "optimizationLog": { ... },
  "shipment": { ... },
  "message": "Reroute approved. Shipment MRD-48244 is now tracking the new route."
}
```

#### `PUT /api/optimize/:id/reject`
**Response:**
```json
{
  "optimizationLog": { ... },
  "message": "Reroute rejected. Shipment MRD-48244 restored to transit."
}
```

### External Integrations

#### Google AI Studio (Gemini)
**Endpoint:** `generativelanguage.googleapis.com`  
**Model:** `gemini-2.0-flash`  
**Usage:** Structured reasoning for reroute decisions  
**Rate Limit:** 60 requests/minute (free tier)

#### Google Maps API
**Endpoints:**
- `maps.googleapis.com/maps/api/geocode/json` (not used in demo)
- `maps.googleapis.com/maps/api/directions/json` (ROAD reroutes)

**Usage:** Generate highway-constrained polylines for truck reroutes

#### MongoDB Atlas
**Connection:** `mongodb+srv://<user>:<pass>@cluster.mongodb.net/meridian`  
**Indexes:** 2dsphere on `origin`, `destination`, `currentLocation`, `hazardZone`  
**Sync:** `syncIndexes()` called on server startup

---

## 9. System Design (High-Level)

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT (React 19)                        │
│  ┌────────────┐  ┌─────────────┐  ┌────────────┐  ┌──────────┐  │
│  │ Dashboard  │  │ Global Map  │  │ AI Control │  │  Detail  │  │
│  │            │  │             │  │   Center   │  │  Drawer  │  │
│  └─────┬──────┘  └──────┬──────┘  └─────┬──────┘  └────┬─────┘  │
│        │                │               │               │        │
│        └────────────────┴───────────────┴───────────────┘        │
│                            │                                      │
│                    MeridianAPI Client                            │
│                    (api.jsx adapter)                             │
└────────────────────────────┼─────────────────────────────────────┘
                             │ HTTP (polling 10s)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      API LAYER (Express)                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ /api/* Router (routes/api.ts)                              │  │
│  │  GET /map-state  │  GET /kpis  │  POST /simulate  │  PUT   │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │                                      │
│                    Controllers                                   │
│              (LogisticsController.ts)                            │
└────────────────────────────┼─────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌───────────────────────┐
│   Models        │ │   Services      │ │   External APIs       │
│  (Mongoose)     │ │                 │ │                       │
│  Shipment       │ │ Orchestrator    │ │ Google Gemini         │
│  RiskAlert      │ │ Agent.ts        │ │ (AI reasoning)        │
│  OptimizationLog│ │ GoogleMaps      │ │ Google Maps Directions│
│  Counter        │ │ Service.ts      │ │ (road reroutes)       │
│                 │ │ SseService.ts   │ │ MongoDB Atlas         │
└─────────────────┘ └─────────────────┘ └───────────────────────┘
```

### Design Principles

**1. Separation of Concerns**
- Controllers handle HTTP, delegate to services
- Services encapsulate business logic (AI, routing)
- Models define data schema + validation

**2. Modularity**
- Each agent (Weather, Risk, Route, Orchestrator) is a独立 module
- Google Maps service is swappable (could replace with Mapbox, Here)
- Pre-seeded decision builder allows demo without AI dependencies

**3. Scalability Considerations**
- MongoDB indexes on geo fields enable fast proximity queries
- Stateless API layer (horizontal scaling possible)
- SSE-ready (SseService stubbed for future real-time push)
- Polling interval (10s) tunable based on load

**4. Fault Tolerance**
- Pre-seeded fallback when AI API unavailable
- Retry logic in OrchestratorAgent (strip markdown, manual JSON parse)
- Transaction rollback on multi-document operations

---

## 10. Limitations

### Current State (Demo)

**1. Mock Data**
- Shipments, hazards, and decisions are seeded via `npm run seed`
- No real-time ingestion from IoT trackers, AIS transponders, or flight radars
- KPIs computed from static dataset (not live operations)

**2. No Real-Time Streaming**
- Frontend uses 10-second polling (not WebSocket/SSE)
- SSE service (`SseService.ts`) is stubbed but not wired to frontend
- Latency: up to 10s delay between backend event and UI update

**3. Simplified AI Logic**
- Pre-seeded decisions replace live Gemini calls in demo
- Only 4 hazard scenarios (round-robin selection)
- No multi-hop reasoning (e.g., cascading delays across correlated shipments)

**4. Limited Integrations**
- Weather data: hardcoded scenarios (no integration with OpenWeather, WeatherAPI)
- Traffic data: not implemented
- Geopolitical risk: manual scenario definitions
- No ERP/WMS integration (SAP, Oracle, Manhattan Associates)

**5. Single-User Demo**
- No authentication/authorization
- No role-based access control (RBAC)
- No audit logging (who approved/rejected reroute)

**6. Geo Limitations**
- Google Maps API key is demo-grade (rate-limited, quota-managed)
- No fallback map provider (Mapbox, OSM)
- Hazard polygons are simplified (not real meteorological data)

---

## 11. Future Improvements

### Short-Term (1–4 Weeks)

**1. Real-Time Data Ingestion**
- WebSocket server for sub-second updates
- Integrate live weather feeds (OpenWeatherMap, Stormglass)
- AIS ship tracking (MarineTraffic, FleetMon)
- Flight radar integration (FlightAware, ADS-B Exchange)

**2. Production Authentication**
- JWT-based auth with refresh tokens
- RBAC: Admin, Operator, Viewer roles
- Audit trail: who approved/rejected each reroute

**3. Enhanced AI Reasoning**
- Multi-shipment correlation (detect cascading delays)
- Reinforcement learning from historical reroute outcomes
- Confidence calibration (track false positive rate)

**4. Mobile Responsive Design**
- Touch-optimized map interactions
- Push notifications for critical alerts
- Offline mode (cached shipment state)

### Medium-Term (1–3 Months)

**5. ML-Based Prediction**
- Train delay prediction model on historical data
- Feature engineering: weather patterns, port congestion, seasonal trends
- Model serving: TensorFlow.js or ONNX runtime

**6. Advanced Simulation**
- "What-if" scenario builder (user-defined hazards)
- Monte Carlo simulation for delay probability distribution
- Cost-benefit analysis dashboard (reroute cost vs spoilage risk)

**7. Multi-User Collaboration**
- Shared decision queue (team-wide visibility)
- Comments/annotations on optimization logs
- Slack/Teams integration for alert notifications

**8. Performance Optimization**
- Redis caching for KPIs (avoid repeated aggregations)
- Pagination for shipments table (1000+ rows)
- Virtualized map rendering (10,000+ routes)

### Long-Term (3–12 Months)

**9. Edge Computing**
- On-device AI for latency-critical decisions (e.g., autonomous trucks)
- Federated learning across fleet vehicles

**10. Blockchain Integration**
- Smart contracts for automated reroute approval (pre-negotiated terms)
- Cargo provenance tracking (IBM Food Trust, TradeLens)

**11. Predictive Maintenance**
- IoT sensor integration (temperature, humidity, shock)
- Anomaly detection for refrigeration units
- Prescriptive maintenance alerts

**12. Sustainability Metrics**
- Carbon footprint tracking per route
- Eco-friendly reroute options (lower fuel burn)
- ESG reporting dashboard

---

## Appendix A: Quick Start Commands

```bash
# From Meridian/AI Supplychain Solution/

# Install all dependencies
npm install
npm install --prefix server
npm install --prefix client

# Seed MongoDB with demo data
npm run seed

# Run dev server (server + client)
npm run dev

# Build for production
npm run build

# Run production server (serves API + static client)
NODE_ENV=production npm start
```

## Appendix B: Environment Variables

```bash
# .env (repo root)
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/meridian
GOOGLE_API_KEY=AIza...              # Gemini API key
GOOGLE_MAPS_API_KEY=AIza...         # Google Maps API key
PORT=5000                           # Optional, default 5000
NODE_ENV=development                # development | production
CORS_ORIGIN=http://localhost:3000   # Optional, default localhost:3000
```

## Appendix C: File Structure

```
Meridian/AI Supplychain Solution/
├── .env                           # Secrets (never commit)
├── package.json                   # Root: concurrently scripts
├── README.md                      # Quick start guide
├── SYSTEM_DOCUMENTATION.md        # This file
│
├── client/                        # React frontend
│   ├── index.html
│   ├── vite.config.js             # Proxy /api → :5000
│   ├── package.json
│   └── public/
│       ├── styles.css             # Global styles + CSS variables
│       └── src/
│           ├── app.jsx            # Root component
│           ├── dashboard.jsx      # KPI strip + AI decisions + table
│           ├── globalmap.jsx      # Google Maps integration
│           ├── map.jsx            # SVG fallback map
│           ├── panels.jsx         # Reasoning panel
│           ├── detail.jsx         # Shipment drawer
│           ├── agents.jsx         # AI Control Center
│           ├── api.jsx            # MeridianAPI client
│           ├── data.jsx           # Static fallback data
│           ├── icons.jsx          # Icon library
│           ├── reasoning.jsx      # Agent activity stream
│           └── tweaks.jsx         # Theme/density controls
│
└── server/                        # Express + TypeScript API
    ├── server.ts                  # Entry point
    ├── tsconfig.json
    ├── package.json
    ├── config/
    │   └── env.ts                 # Preload .env (side-effect)
    ├── controllers/
    │   └── LogisticsController.ts # All API handlers
    ├── models/
    │   ├── Shipment.ts            # Mongoose schema
    │   ├── RiskAlert.ts           # Hazard model
    │   ├── OptimizationLog.ts     # AI decision log
    │   └── Counter.ts             # Atomic ID generator
    ├── routes/
    │   └── api.ts                 # /api router
    ├── services/
    │   ├── OrchestratorAgent.ts   # Gemini reasoning chain
    │   ├── GoogleMapsService.ts   # Road rerouting
    │   └── SseService.ts          # SSE event emitter
    ├── scripts/
    │   └── seed.ts                # Seed MongoDB
    └── types/
        └── geo.ts                 # GeoJSON type definitions
```

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-04-27  
**Author:** Meridian Engineering Team  
**Contact:** engineering@meridian-logistics.io
