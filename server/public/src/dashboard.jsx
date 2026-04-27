// ============================================================
// Meridian — Overview Dashboard (REDESIGNED)
//   Mounted by app.jsx when view === "overview".
//   Sections: KPI strip → Predictive Alert + Global Route Monitor
//             → LIVE AI DECISIONS (hero) → Active Shipments table.
// ============================================================

// ---- Tiny helpers ----------------------------------------------------
const cls = (...xs) => xs.filter(Boolean).join(" ");

// Static decision data for the hero card. Takes precedence over live
// entries so the visual hierarchy is preserved even when the API is
// quiet. Live entries (when present) are appended below.
const HERO_DECISIONS = [
  {
    id:           "OPT-MS39004",
    shipmentId:   "MS-39004",
    contextLabel: "Delayed · Ocean",
    vehicle:      "Ship",
    signal:       "Globe",
    signalLabel:  "Satellite Data",
    resolution:   "Reroute proposal · Port → Air",
    status:       "PENDING",
    confidence:   0.98,
    savings:      "Estimated saving: $12,500",
    analysis:     "Port strike in Dubai identified. Reroute via Emirates SkyCargo proposed.",
  },
  {
    id:           "OPT-MS39002",
    shipmentId:   "MS-39002",
    contextLabel: "On Track · Road",
    vehicle:      "Truck",
    signal:       "Pulse",
    signalLabel:  "Traffic Data",
    resolution:   "Route optimised · +14% speed",
    status:       "EXECUTED",
    confidence:   0.94,
    analysis:     "Corridor traffic agent found a faster alternate — fuel efficiency maintained.",
  },
  {
    id:           "OPT-MS39006",
    shipmentId:   "MS-39006",
    contextLabel: "Weather Risk · Ocean",
    vehicle:      "Ship",
    signal:       "Temp",
    signalLabel:  "Meteo Data",
    resolution:   "Assessing detour",
    status:       "ASSESSING",
    confidence:   0.78,
    analysis:     "Monitoring shipment MS-39006. Analysing potential hurricane impact. Delay ~48h likely.",
  },
];

// Converts a live adapted shipment → table row shape
const TRANSPORT_META = {
  air:   { key: "air",   label: "Air",   icon: "Pulse", tone: "violet", operator: "Pilot",   constraint: "airspace + weather corridor" },
  ocean: { key: "ocean", label: "Ocean", icon: "Ship",  tone: "warn",   operator: "Captain", constraint: "sea lane + port window" },
  sea:   { key: "ocean", label: "Ocean", icon: "Ship",  tone: "warn",   operator: "Captain", constraint: "sea lane + port window" },
  road:  { key: "road",  label: "Road",  icon: "Truck", tone: "ok",     operator: "Driver",  constraint: "physical road detour" },
  rail:  { key: "rail",  label: "Rail",  icon: "Route", tone: "mute",   operator: "Rail Ops", constraint: "fixed rail corridor" },
};

const DASH_MODE_FILTERS = [
  { key: "all",   label: "All operators", icon: "Globe", operator: "Control" },
  { key: "road",  label: "Drivers",       icon: "Truck", operator: "Road" },
  { key: "ocean", label: "Captains",      icon: "Ship",  operator: "Ocean" },
  { key: "air",   label: "Pilots",        icon: "Pulse", operator: "Air" },
  { key: "rail",  label: "Rail Ops",      icon: "Route", operator: "Rail" },
];

function transportMeta(mode) {
  return TRANSPORT_META[(mode || "air").toLowerCase()] ?? TRANSPORT_META.air;
}

function shipmentToRow(s) {
  const STATUS = {
    transit:   { label: "In Transit",  tone: "ok"     },
    risk:      { label: "At Risk",     tone: "alert"  },
    delayed:   { label: "Delayed",     tone: "warn"   },
    rerouted:  { label: "Rerouted",    tone: "violet" },
    delivered: { label: "Delivered",   tone: "ok"     },
  };
  const st = STATUS[s.status] ?? { label: s.status, tone: "ok" };
  const mode = transportMeta(s.transportType);
  return {
    rawId:        s.id,
    id:           `#${s.id}`,
    cargo:        s.cargo ?? "General cargo",
    modeKey:      mode.key,
    modeLabel:    mode.label,
    modeIcon:     mode.icon,
    modeTone:     mode.tone,
    operator:     mode.operator,
    constraint:   mode.constraint,
    dest:         `${s.from} → ${s.to}`,
    statusLabel:  st.label,
    statusTone:   st.tone,
    eta:          s.etaIso ?? "—",
    risk:         s.status === "risk" ? "High Risk" : s.status === "delayed" ? "Low Risk" : s.status === "rerouted" ? "Safe" : "On Track",
    decision:     s.status === "risk" ? "Awaiting approval" : s.status === "rerouted" ? "Reroute applied" : s.status === "delayed" ? "Monitoring delay" : "Route clear",
    decisionTone: s.status === "risk" ? "alert" : s.status === "rerouted" ? "violet" : "ok",
    progress:     s.progress ?? 0,
    progressTone: s.status === "risk" ? "alert" : s.status === "delayed" ? "warn" : "ok",
    action:       s.status === "risk" ? "approve" : "view",
  };
}

// ---- 1. KPI STRIP ----------------------------------------------------
function OperationsBrief({ shipments = [], hazards = [], modeFilter = "all", onModeFilterChange }) {
  const highRisk = shipments.filter(s => s.status === "risk");
  const delayed = shipments.filter(s => s.status === "delayed");
  const modes = shipments.reduce((acc, s) => {
    const meta = transportMeta(s.transportType);
    acc[meta.key] = (acc[meta.key] || 0) + 1;
    return acc;
  }, {});
  const focusedFilter = DASH_MODE_FILTERS.find(f => f.key === modeFilter) ?? DASH_MODE_FILTERS[0];
  const lead = highRisk[0] || delayed[0] || shipments[0];
  const leadMode = transportMeta(lead?.transportType);

  return (
    <section className="ops-brief">
      <div className="ops-brief-main">
        <div className="card-eyebrow"><Icons.Globe size={12}/> Operations command center</div>
        <div className="ops-brief-title">
          {lead
            ? `${leadMode.operator} support active for ${lead.from} to ${lead.to}`
            : "All journeys are being monitored"}
        </div>
        <div className="ops-brief-sub">
          Meridian is matching weather, disruption intelligence, and route constraints against live journeys before recommending a reroute.
        </div>
      </div>
      <div className="ops-brief-stats">
        <div><strong>{highRisk.length}</strong><span>Need approval</span></div>
        <div><strong>{hazards.length}</strong><span>Hazards watched</span></div>
        <div><strong>{focusedFilter.operator}</strong><span>Current focus</span></div>
      </div>
      <div className="mode-strip">
        {DASH_MODE_FILTERS.map(filter => {
          const Icon = Icons[filter.icon] ?? Icons.Route;
          const count = filter.key === "all" ? shipments.length : (modes[filter.key] || 0);
          return (
            <button
              key={filter.key}
              type="button"
              className={cls("mode-chip", modeFilter === filter.key && "active")}
              onClick={() => onModeFilterChange?.(filter.key)}
            >
              <Icon size={12}/>
              {filter.label}
              <strong>{count}</strong>
            </button>
          );
        })}
        {shipments.length === 0 && (
          <span className="mode-chip muted">No live journeys</span>
        )}
      </div>
    </section>
  );
}

function DashKpiStrip({ kpis, shipments = [], hazards = [] }) {
  const onTime   = kpis ? `${kpis.onTime}%` : "96.4%";
  const atRisk   = `${shipments.filter(s => s.status === "risk").length || (kpis ? kpis.atRisk : 14)}`;
  const rerouted = `${shipments.filter(s => s.status === "rerouted").length || (kpis ? kpis.reroutedToday : 210)}`;
  const activeJourneys = `${shipments.length || (kpis ? kpis.activeShipments : 2847)}`;
  const activeHazards = `${hazards.length || 0}`;
  const items = [
    { label: "Active Journeys", value: activeJourneys, delta: "multi-mode", deltaTone: "violet", iconKey: "Globe", spark: [8,9,10,11,10,12,12,13,12,14,15,15], color: "var(--violet)", badge: "LIVE", badgeTone: "ok" },
    { label: "On-Time %",       value: onTime,         delta: "+1.2%",     deltaTone: "ok",     iconKey: "Check", spark: [92,93,93,94,94,95,95,96,96,97,96,96], color: "var(--ok)" },
    { label: "At Risk",         value: atRisk,         delta: "+3",        deltaTone: "alert",  iconKey: "Alert", spark: [4,5,5,7,8,9,11,10,12,13,14,14], color: "var(--alert)", badge: "ACTION", badgeTone: "alert" },
    { label: "Active Hazards",  value: activeHazards,  delta: `${rerouted} reroutes`, deltaTone: "warn", iconKey: "Temp", spark: [1,1,2,2,2,3,3,2,3,3,3,3], color: "var(--warn)", badge: "WATCH", badgeTone: "warn" },
  ];
  return (
    <section className="dash-kpis">
      {items.map((k, i) => {
        const Icon = window.Icons[k.iconKey];
        return (
          <div key={i} className="dash-kpi">
            <div className="dash-kpi-icon"><Icon size={18}/></div>
            <div className="dash-kpi-body">
              <div className="dash-kpi-head">
                <span className="dash-kpi-label">{k.label}</span>
                {k.badge && <span className={cls("dash-pill", `tone-${k.badgeTone}`)}>{k.badge}</span>}
              </div>
              <div className="dash-kpi-value-row">
                <span className="dash-kpi-value">{k.value}</span>
                <span className={cls("dash-kpi-delta", `tone-${k.deltaTone}`)}>▲ {k.delta}</span>
              </div>
            </div>
            <div className="dash-kpi-spark">
              <Spark values={k.spark} color={k.color} w={92} h={32}/>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ---- 2. PREDICTIVE ALERT CARD ---------------------------------------
function PredictiveAlertCard({ shipments = [], hazards = [], onViewImpact, onSimulate }) {
  const watchRows = (hazards.length ? hazards : window.HAZARDS || []).slice(0, 3).map((hazard, index) => {
    const affected = (hazard.affects || []).map(id => shipments.find(s => s.id === id)).filter(Boolean);
    const first = affected[0];
    const mode = transportMeta(first?.transportType);
    const tone = hazard.severity === "High" || index === 0 ? "alert" : "warn";
    return {
      id: first?.id ?? hazard.id,
      title: hazard.title ?? "Route hazard",
      badge: hazard.type === "Weather" ? "WEATHER" : hazard.type?.toUpperCase() ?? "HAZARD",
      tone,
      body: first
        ? `${mode.operator} alert: ${first.from} to ${first.to} intersects ${hazard.title}. ${mode.constraint} under review.`
        : `${hazard.title}. Monitoring the corridor for affected journeys.`,
      affected: affected.length || hazard.affects?.length || 0,
    };
  });
  return (
    <div className="predict-alert">
      <div className="card-head">
        <div className="card-eyebrow"><span className="dash-pill tone-violet">PREDICTIVE</span> Hazard watch</div>
        <div className="card-title">Routes needing attention</div>
        <div className="card-sub">Natural hazards and disruptions matched against active journeys.</div>
      </div>

      {watchRows.length > 0 && watchRows.map(row => (
        <div key={row.id} className={cls("predict-alert-row", `tone-${row.tone}`)}>
          <div className="predict-row-head">
            <span className="mono strong">#{row.id}</span>
            <span className={cls("dash-pill", `tone-${row.tone}`)}>{row.badge}</span>
          </div>
          <div className="predict-row-body">{row.body}</div>
          <div className="predict-row-foot">{row.affected} linked shipment{row.affected === 1 ? "" : "s"}</div>
        </div>
      ))}

      {watchRows.length === 0 && (
        <>
      <div className="predict-alert-row tone-alert">
        <div className="predict-row-head">
          <span className="mono strong">#MS-39004</span>
          <span className="dash-pill tone-alert">IMMINENT</span>
        </div>
        <div className="predict-row-body">
          Shipment <strong>MS-39004</strong> entering hazard zone in <strong className="text-alert">2h</strong> — storm Eloise (Cat 3).
        </div>
      </div>

      <div className="predict-alert-row tone-warn">
        <div className="predict-row-head">
          <span className="mono strong">#MS-39007</span>
          <span className="dash-pill tone-warn">HURRICANE</span>
        </div>
        <div className="predict-row-body">Pacific corridor — landfall in 9h.</div>
      </div>

      <div className="predict-alert-row tone-warn">
        <div className="predict-row-head">
          <span className="mono strong">#MS-39008</span>
          <span className="dash-pill tone-warn">PORT STRIKE</span>
        </div>
        <div className="predict-row-body">Singapore terminal · 36h closure expected.</div>
      </div>

        </>
      )}

      <div className="predict-alert-actions">
        <button className="btn primary" onClick={onViewImpact}>View Impact</button>
        <button className="btn"         onClick={onSimulate}>Simulate</button>
      </div>
    </div>
  );
}

// ---- 4. GLOBAL ROUTE MONITOR ----------------------------------------
const DASHBOARD_GMAP_KEY =
  window.__GOOGLE_MAPS_KEY__ ||
  window.__MERIDIAN_GOOGLE_MAPS_KEY__ ||
  "AIzaSyC-4wDguS9TKxEJcZ1bncrCzCr4_eDIIDg";

const DASHBOARD_DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f6f8fb" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }, { weight: 0.6 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbeafe" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f8fafc" }] },
];

function loadDashboardMapScript(initMap) {
  if (window.google && window.google.maps) {
    initMap();
    return;
  }

  const existing = document.getElementById("meridian-google-maps-sdk");
  if (existing) {
    existing.addEventListener("load", initMap, { once: true });
    return;
  }

  const script = document.createElement("script");
  script.id = "meridian-google-maps-sdk";
  script.src = `https://maps.googleapis.com/maps/api/js?key=${DASHBOARD_GMAP_KEY}`;
  script.async = true;
  script.onload = initMap;
  document.body.appendChild(script);
}

function projectedHazardCenter(hazard) {
  const pts = hazard.points || [];
  if (!pts.length) return { lat: 15, lng: 60 };
  const center = pts.reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1]], [0, 0]).map(v => v / pts.length);
  return {
    lat: 90 - (center[1] / 500) * 180,
    lng: (center[0] / 1000) * 360 - 180,
  };
}

function DashboardGoogleMap({ shipments, selectedId, onSelect }) {
  const mapRef = React.useRef(null);
  const mapInst = React.useRef(null);
  const overlaysRef = React.useRef([]);

  React.useEffect(() => {
    let cancelled = false;

    const clearOverlays = () => {
      overlaysRef.current.forEach(item => item.setMap && item.setMap(null));
      overlaysRef.current = [];
    };

    const initMap = () => {
      if (cancelled || !mapRef.current || !(window.google && window.google.maps)) return;

      clearOverlays();
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 20, lng: 0 },
        zoom: 2,
        minZoom: 2,
        styles: DASHBOARD_DARK_MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "cooperative",
        backgroundColor: "#f8fafc",
      });
      mapInst.current = map;

      (shipments || []).slice(0, 10).forEach((shipment) => {
        const from = window.cityByCode?.[shipment.from];
        const to = window.cityByCode?.[shipment.to];
        if (!from || !to) return;

        const routeCoordinates = [
          { lat: from.lat, lng: from.lon },
          { lat: to.lat, lng: to.lon },
        ];
        const isSelected = shipment.id === selectedId;
        const strokeColor =
          shipment.status === "risk" ? "#ef4444" :
          shipment.status === "rerouted" ? "#8b5cf6" :
          "#22c55e";

        const line = new window.google.maps.Polyline({
          path: routeCoordinates,
          geodesic: true,
          strokeColor,
          strokeOpacity: isSelected ? 0.92 : 0.68,
          strokeWeight: isSelected ? 4 : 3,
          map,
        });
        line.addListener("click", () => onSelect && onSelect(shipment.id));
        overlaysRef.current.push(line);

        const markerPosition = {
          lat: from.lat + (to.lat - from.lat) * (shipment.progress || 0.5),
          lng: from.lon + (to.lon - from.lon) * (shipment.progress || 0.5),
        };
        const customIcon = {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 6 : 4.5,
          fillColor: strokeColor,
          fillOpacity: 0.95,
          strokeColor: "#ffffff",
          strokeWeight: 1.5,
        };
        const marker = new window.google.maps.Marker({
          position: markerPosition,
          map,
          icon: customIcon,
          title: shipment.id,
        });
        marker.addListener("click", () => onSelect && onSelect(shipment.id));
        overlaysRef.current.push(marker);
      });

      (window.HAZARDS || []).slice(0, 3).forEach((hazard) => {
        const circle = new window.google.maps.Circle({
          center: projectedHazardCenter(hazard),
          radius: hazard.severity === "High" ? 620000 : 420000,
          fillColor: hazard.severity === "High" ? "#ef4444" : "#f59e0b",
          fillOpacity: 0.2,
          strokeOpacity: 0,
          map,
        });
        overlaysRef.current.push(circle);
      });
    };

    loadDashboardMapScript(initMap);

    return () => {
      cancelled = true;
      clearOverlays();
    };
  }, [shipments, selectedId, onSelect]);

  return <div ref={mapRef} className="map-container" />;
}

function GlobalRouteMonitor({ shipments, hazards = [], selectedId, onSelect, onExpand }) {
  const risky = shipments.filter(s => s.status === "risk" || s.status === "delayed").length;
  const rerouted = shipments.filter(s => s.status === "rerouted").length;
  return (
    <div className="route-monitor">
      <div className="card-head row">
        <div>
          <div className="card-eyebrow">LIVE MAP · NETWORK</div>
          <div className="card-title">Global Route Monitor</div>
          <div className="card-sub">{hazards.length} hazards detected - {risky} journeys under watch</div>
        </div>
        <div className="route-monitor-actions">
          <span className="dash-pill tone-warn">{hazards.length} hazards</span>
          <span className="dash-pill tone-violet">{rerouted} reroutes</span>
          <button className="btn" onClick={onExpand}>
            <Icons.Zoom size={13}/> Expand to Map
          </button>
        </div>
      </div>
      <div className="route-monitor-map">
        <DashboardGoogleMap
          shipments={shipments.slice(0, 24)}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

// ---- 3. LIVE AI DECISIONS — HERO ------------------------------------
function LiveAiDecisions({ decisions, onApprove, onReject, onOpenAgent }) {
  return (
    <section className="live-ai-hero-wrap">
      <div className="live-ai-hero-aura" aria-hidden="true"/>
      <div className="live-ai-hero">
        <div className="live-ai-bar"/>
        <div className="card-head row">
          <div>
            <div className="card-eyebrow"><Icons.Brain size={12}/> LIVE AI DECISIONS</div>
            <div className="card-title">AI route safety decisions</div>
            <div className="card-sub">Orchestrator, Weather, Intelligence, and Map agents preparing safe route actions.</div>
          </div>
          <div className="live-ai-head-actions">
            <span className="streaming-pill">
              <span className="streaming-dot"/>
              Streaming
            </span>
            <button className="btn primary" onClick={onOpenAgent}>Open Agent Reasoning</button>
          </div>
        </div>

        <div className="live-ai-rows">
          {decisions.map(d => (
            <DecisionRow key={d.id} d={d} onApprove={onApprove} onReject={onReject}/>
          ))}
        </div>
      </div>
    </section>
  );
}

function DecisionRow({ d, onApprove, onReject }) {
  const VehicleIcon = window.Icons[d.vehicle] ?? window.Icons.Ship;
  const SignalIcon  = window.Icons[d.signal]  ?? window.Icons.Globe;
  const status = {
    PENDING:   { label: "Decision Pending",     tone: "warn"   },
    EXECUTED:  { label: "Optimised & Executed", tone: "ok"     },
    ASSESSING: { label: "AI Assessing",         tone: "violet" },
  }[d.status];

  return (
    <div className={cls("live-ai-row", `state-${d.status.toLowerCase()}`)}>
      {d.status === "PENDING" && <span className="live-ai-shimmer" aria-hidden="true"/>}

      <div className="live-ai-row-grid">
        <div className="live-ai-row-main">
          <div className="live-ai-row-meta">
            <span className="mono strong">Decision · <span className="text-violet">{d.shipmentId}</span></span>
            <span className="dash-pill tone-mute">{d.contextLabel}</span>
          </div>

          {/* Flow chips */}
          <div className="flow-chips">
            <span className="flow-chip">
              <VehicleIcon size={12}/>{vehicleLabel(d.vehicle)}
            </span>
            <span className="flow-arrow">→</span>
            <span className="flow-chip tone-warn">
              <SignalIcon size={12}/>{d.signalLabel}
            </span>
            <span className="flow-arrow">→</span>
            <span className="flow-chip tone-violet flow-chip-ai">
              <Icons.Brain size={12}/>Meridian AI
            </span>
            <span className="flow-arrow">→</span>
            <span className="flow-chip tone-ok">
              <Icons.Route size={12}/>{d.resolution}
            </span>
          </div>

          <p className="live-ai-analysis">
            <span className="strong">Analysis:</span> {d.analysis}{" "}
            {d.savings && <span className="text-ok strong">{d.savings}</span>}
          </p>
        </div>

        <div className="live-ai-row-side">
          <span className={cls("dash-pill", `tone-${status.tone}`, "with-dot")}>
            <span className="dot"/> {status.label}
          </span>

          <div className="confidence">
            <div className="confidence-row">
              <span className="confidence-label">CONFIDENCE</span>
              <span className={cls("confidence-pct",
                d.confidence >= 0.9 ? "tone-ok" : d.confidence >= 0.8 ? "tone-violet" : "tone-warn")}>
                {Math.round(d.confidence*100)}%
              </span>
            </div>
            <div className={cls("confidence-bar",
              d.confidence >= 0.9 ? "tone-ok" : d.confidence >= 0.8 ? "tone-violet" : "tone-warn")}>
              <span style={{width: `${d.confidence*100}%`}}/>
            </div>
          </div>

          <div className="live-ai-actions">
            {d.status === "PENDING" && (
              <>
                <button className="btn primary" onClick={() => onApprove?.(d)}>Approve AI Action</button>
                <button className="btn"          onClick={() => onReject?.(d)}>Reject</button>
              </>
            )}
            {d.status === "EXECUTED" && (
              <button className="btn">View Details</button>
            )}
            {d.status === "ASSESSING" && (
              <>
                <span className="typing-dots">
                  <i style={{animationDelay: "0ms"}}/>
                  <i style={{animationDelay: "160ms"}}/>
                  <i style={{animationDelay: "320ms"}}/>
                  reasoning
                </span>
                <button className="btn">View Options</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function vehicleLabel(key) {
  return { Ship: "Ocean Vessel", Truck: "Truck", Pulse: "Air Freight" }[key] ?? "Vehicle";
}

// ---- 5. ACTIVE SHIPMENTS TABLE --------------------------------------
function ActiveShipmentsTable({ rows, onSelect }) {
  return (
    <section className="dash-table-card">
      <div className="card-head row">
        <div>
          <div className="card-eyebrow">FLEET · LIVE</div>
          <div className="card-title">Active Shipments</div>
          <div className="card-sub">Mode, cargo, route state, and AI action are visible in one scan.</div>
        </div>
        <div className="dash-table-head-actions">
          <span className="dash-pill tone-violet">{rows.length} live</span>
          <button className="btn" onClick={() => rows[0] && onSelect?.(rows[0].rawId)}>Open Shipments</button>
        </div>
      </div>

      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Shipment ID</th>
              <th>Destination</th>
              <th>Mode</th>
              <th>Cargo</th>
              <th>Status</th>
              <th>ETA</th>
              <th>Risk Level</th>
              <th>AI Decision Flow</th>
              <th>Progress</th>
              <th style={{textAlign: "right"}}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="dash-empty-row">
                <td colSpan="10">
                  No shipments match this operator focus.
                </td>
              </tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="dash-row" onClick={() => onSelect?.(r.rawId)}>
                <td><span className="mono strong">{r.id}</span></td>
                <td><span className="dest">{r.dest}</span></td>
                <td><ModePill row={r}/></td>
                <td><span className="cargo-text">{r.cargo}</span></td>
                <td>
                  <span className={cls("dash-pill", "with-dot", `tone-${r.statusTone}`)}>
                    <span className="dot"/>{r.statusLabel}
                  </span>
                </td>
                <td><span className="mono">{r.eta}</span></td>
                <td><RiskChip risk={r.risk}/></td>
                <td>
                  <span className="decision-cell">
                    <span className={cls("decision-dot", `tone-${r.decisionTone}`)}/>
                    <Icons.Brain size={12}/>
                    <span className="flow-arrow">→</span>
                    <span className={cls("decision-label", `tone-${r.decisionTone}`)}>{r.decision}</span>
                  </span>
                </td>
                <td>
                  <div className="dash-progress-cell">
                    <div className={cls("dash-progress", `tone-${r.progressTone}`)}>
                      <span style={{width: `${r.progress*100}%`}}/>
                    </div>
                    <span className="mono pct">{Math.round(r.progress*100)}%</span>
                  </div>
                </td>
                <td style={{textAlign: "right"}}>
                  {r.action === "approve" ? (
                    <span className="row-actions">
                      <button className="btn primary sm" onClick={e => { e.stopPropagation(); onSelect?.(r.rawId); }}>Approve</button>
                      <button className="btn sm" onClick={e => e.stopPropagation()}>Reject</button>
                    </span>
                  ) : (
                    <button className="btn sm" onClick={e => { e.stopPropagation(); onSelect?.(r.rawId); }}>View Details</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RiskChip({ risk }) {
  const tone = risk === "On Track" || risk === "Safe" ? "ok"
             : risk === "Low Risk" ? "warn"
             : "alert";
  const Icon = tone === "alert" ? Icons.Alert : Icons.Check;
  return (
    <span className={cls("risk-chip", `tone-${tone}`)}>
      <Icon size={12}/>{risk}
    </span>
  );
}

function ModePill({ row }) {
  const Icon = Icons[row.modeIcon] ?? Icons.Route;
  return (
    <span className={cls("mode-pill", `tone-${row.modeTone}`)} title={row.constraint}>
      <Icon size={12}/>{row.modeLabel}
      <span>{row.operator}</span>
    </span>
  );
}

// ---- DASHBOARD (top-level mounted by app.jsx) -----------------------
function Dashboard({ shipments, selectedId, onSelectShipment, onExpandMap, onSimulate, onViewImpact, onOpenAgent, entries, kpis }) {
  const [modeFilter, setModeFilter] = React.useState("all");
  // Combine static hero decisions with the latest live entry (if any).
  const liveOne = (entries ?? []).find(e => e.status === "active");
  const decisions = liveOne
    ? [
        {
          id:           liveOne.id,
          shipmentId:   liveOne.shipmentId ?? "MRD-LIVE",
          contextLabel: "Live · Orchestrator",
          vehicle:      "Ship",
          signal:       "Pulse",
          signalLabel:  "Live signal",
          resolution:   liveOne.title?.slice(0, 36) ?? "Reroute proposal",
          status:       "PENDING",
          confidence:   0.92,
          analysis:     liveOne.body ?? "Live agent reasoning streaming.",
        },
        ...HERO_DECISIONS,
      ].slice(0, 3)
    : HERO_DECISIONS;
  const hazards = window.HAZARDS || [];
  const rows = (shipments ?? []).map(shipmentToRow);
  const focusedRows = modeFilter === "all" ? rows : rows.filter(row => row.modeKey === modeFilter);

  return (
    <div className="dash">
      <OperationsBrief
        shipments={shipments ?? []}
        hazards={hazards}
        modeFilter={modeFilter}
        onModeFilterChange={setModeFilter}
      />
      <DashKpiStrip kpis={kpis} shipments={shipments ?? []} hazards={hazards}/>

      <div className="dashboard-grid">
        <PredictiveAlertCard
          shipments={shipments ?? []}
          hazards={hazards}
          onViewImpact={onViewImpact}
          onSimulate={onSimulate}
        />
        <GlobalRouteMonitor
          shipments={shipments ?? []}
          hazards={hazards}
          selectedId={selectedId}
          onSelect={onSelectShipment}
          onExpand={onExpandMap}
        />
        <div className="hero-card">
          <LiveAiDecisions
            decisions={decisions}
            onApprove={d => onSelectShipment?.(d.shipmentId)}
            onReject={() => {}}
            onOpenAgent={onOpenAgent}
          />
        </div>

        <ActiveShipmentsTable rows={focusedRows} onSelect={onSelectShipment}/>
      </div>
    </div>
  );
}

// Expose globally for app.jsx (no module system in Babel-CDN setup)
Object.assign(window, {
  Dashboard,
  OperationsBrief,
  DashKpiStrip,
  PredictiveAlertCard,
  GlobalRouteMonitor,
  LiveAiDecisions,
  ActiveShipmentsTable,
});
