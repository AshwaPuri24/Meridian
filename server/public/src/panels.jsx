// ============================================================
// Meridian — Sidebar, Topbar, Shipments drawer, Stats strip
// ============================================================

function Sidebar({ activeView, onView, open, onClose }) {
  const items = [
    { id: "overview",   label: "Overview",        icon: "Gauge",  active: true },
    { id: "globalmap",  label: "Global Map",      icon: "Globe",  count: "LIVE", tone: "ok" },
    { id: "shipments",  label: "Shipments",       icon: "Ship",   count: "2,847" },
    { id: "alerts",     label: "Risk Alerts",     icon: "Alert",  count: 23, tone: "alert" },
    { id: "agents",     label: "Agent Activity",  icon: "Brain",  count: "LIVE", tone: "warn" },
    { id: "routes",     label: "Route Planner",   icon: "Route" },
    { id: "fleet",      label: "Fleet",           icon: "Truck" },
  ];
  const second = [
    { id: "analytics", label: "Analytics", icon: "Graph" },
    { id: "settings",  label: "Settings",  icon: "Settings" },
  ];
  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="brand">
        <div className="brand-mark"/>
        <div>
          <div className="brand-name">Meridian</div>
          <div className="brand-sub">Logistics · v2.4</div>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-section-label">Operations</div>
        {items.map(it => {
          const Icon = Icons[it.icon];
          return (
            <a
              key={it.id}
              className="nav-item"
              data-active={activeView === it.id}
              onClick={() => {
                onView(it.id);
                onClose && onClose();
              }}
            >
              <Icon size={14} />
              <span>{it.label}</span>
              {it.count !== undefined && <span className="nav-count" data-tone={it.tone}>{it.count}</span>}
            </a>
          );
        })}

        <div className="nav-section-label">Workspace</div>
        {second.map(it => {
          const Icon = Icons[it.icon];
          return (
            <a
              key={it.id}
              className="nav-item"
              onClick={() => {
                onView(it.id);
                onClose && onClose();
              }}
            >
              <Icon size={14}/>
              <span>{it.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div className="agent-pulse">
          <div className="agent-pulse-dot"/>
          <div>
            <div className="agent-pulse-label">4 agents online</div>
            <div className="agent-pulse-sub">gemini-pro · 12ms</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ScopeSelector({ scope, onChange }) {
  return (
    <label className="scope-selector">
      <span className="scope-label">Scope</span>
      <select value={scope} onChange={e => onChange(e.target.value)} aria-label="Scope selector">
        <option value="global">Global</option>
        <option value="country">Country</option>
        <option value="city">City</option>
      </select>
    </label>
  );
}

function Topbar({
  onSimulate,
  simActive,
  scope,
  onScopeChange,
  theme,
  onToggleTheme,
  onToggleSidebar,
  onToggleAgent,
}) {
  const scopeLabel = {
    global: "Global",
    country: "Country",
    city: "City",
  }[scope] || "Global";

  return (
    <header className="topbar">
      <button
        className="btn ghost topbar-burger"
        onClick={onToggleSidebar}
        title="Open menu"
        style={{padding: "6px 8px"}}
        type="button"
      >
        <Icons.Menu size={16}/>
      </button>
      <div className="topbar-title">
        <h1>{scopeLabel} Operations</h1>
        <small>APR 18, 2026 · 14:32 UTC · {scopeLabel.toUpperCase()}</small>
      </div>
      <ScopeSelector scope={scope} onChange={onScopeChange}/>
      <div className="topbar-divider"/>

      <div className="kpi-chip">
        <span className="label">On-Time</span>
        <span className="val">94.2%</span>
        <span className="delta up">▲ 0.4</span>
      </div>
      <div className="kpi-chip">
        <span className="label">At Risk</span>
        <span className="val" style={{color: "var(--alert)"}}>23</span>
        <span className="delta down">▲ 6</span>
      </div>
      <div className="kpi-chip">
        <span className="label">Rerouted</span>
        <span className="val" style={{color: "var(--violet)"}}>48</span>
        <span className="delta">today</span>
      </div>

      <div className="topbar-spacer"/>

      <div className="topbar-search">
        <Icons.Search size={13} />
        <input placeholder="Search shipments, routes, alerts…"/>
        <kbd>⌘K</kbd>
      </div>
      <button className="btn ghost" title="Notifications" style={{padding: "6px 8px"}}>
        <Icons.Bell size={14}/>
      </button>
      <button
        className="btn ghost theme-toggle"
        onClick={onToggleTheme}
        title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
        style={{padding: "6px 8px"}}
      >
        {theme === "light" ? <Icons.Moon size={14}/> : <Icons.Sun size={14}/>}
      </button>
      <button
        className="btn topbar-agent-toggle"
        onClick={onToggleAgent}
        type="button"
      >
        <Icons.Brain size={13}/> Agent Reasoning
      </button>
      <button className={"btn " + (simActive ? "danger" : "primary")} onClick={onSimulate}>
        {simActive ? <><Icons.Pause size={13}/> Pause simulation</> : <><Icons.Play size={13}/> Simulate disruption</>}
      </button>
    </header>
  );
}

// --- Tiny sparkline (inline SVG) ---
function Spark({ values, color = "var(--accent)", w = 80, h = 22 }) {
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const area = d + ` L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} style={{overflow:"visible"}}>
      <path d={area} fill={color} opacity="0.12"/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2" fill={color}/>
    </svg>
  );
}

function StatsStrip({ simActive }) {
  const stats = [
    { label: "Active Shipments", val: "2,847", delta: "+142 vs. yesterday", spark: [40,42,44,41,45,48,52,50,55,58,56,60], color: "var(--accent)" },
    { label: "On-Time Delivery", val: "94.2%",  delta: "↑ 0.4% · 30d trend", spark: [90,91,89,92,93,92,94,93,94,95,94,94], color: "var(--ok)" },
    { label: "Disruptions Prevented", val: simActive ? "312" : "311", delta: "312 hours saved this week", spark: [20,22,28,32,35,42,48,55,62,70,78,86], color: "var(--violet)" },
    { label: "Cost Avoided", val: "$1.28M", delta: "AI rerouting · 7d", spark: [30,40,52,50,62,72,80,88,95,102,115,128], color: "var(--warn)" },
  ];
  return (
    <div className="stats-strip">
      {stats.map((s, i) => (
        <div key={i} className="stat-cell">
          <div className="stat-label">{s.label}</div>
          <div className="stat-val">{s.val}</div>
          <div className="stat-delta">{s.delta}</div>
          <div className="stat-spark"><Spark values={s.spark} color={s.color} /></div>
        </div>
      ))}
    </div>
  );
}

function ShipmentsDrawer({ shipments, selectedId, onSelect, filter, onFilter, transportType, onTransportTypeChange }) {
  const ships = shipments.filter(s => filter === "all" || s.status === filter);
  const transportOptions = [
    { id: "all", label: "All" },
    { id: "sea", label: "Sea" },
    { id: "air", label: "Air" },
    { id: "road", label: "Road" },
    { id: "rail", label: "Rail" },
  ];

  return (
    <div className="shipments-drawer">
      <div className="drawer-head">
        <div className="drawer-title">Shipments<span className="count">· {ships.length}</span></div>
        <div className="drawer-filter">
          {[
            { id: "all", label: "All", tone: null },
            { id: "risk", label: "At Risk", tone: "alert" },
            { id: "delayed", label: "Delayed", tone: "warn" },
            { id: "rerouted", label: "Rerouted", tone: null },
            { id: "transit", label: "In Transit", tone: "ok" },
          ].map(f => (
            <button key={f.id} className="filter-pill" data-tone={filter === f.id ? f.tone : null}
                    onClick={() => onFilter(f.id)}
                    style={filter === f.id ? {background: "var(--bg-hover)", color: "var(--fg-0)"} : {}}>
              {f.label}
            </button>
          ))}
          <button className="btn ghost" style={{padding:"4px 8px", fontSize:11}}><Icons.Filter size={12}/> Filters</button>
        </div>
      </div>
      <div className="transport-filter-row">
        <div className="transport-filter-label">Transport</div>
        <div className="transport-filter-pills">
          {transportOptions.map(option => (
            <button
              key={option.id}
              className="filter-pill"
              onClick={() => onTransportTypeChange(option.id)}
              style={transportType === option.id ? {background: "var(--bg-hover)", color: "var(--fg-0)"} : {}}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="ships">
          <thead>
            <tr>
              <th style={{width:"14%"}}>Shipment ID</th>
              <th style={{width:"18%"}}>Route</th>
              <th style={{width:"14%"}}>Cargo</th>
              <th style={{width:"10%"}}>Status</th>
              <th style={{width:"22%"}}>Progress</th>
              <th style={{width:"14%"}}>ETA</th>
              <th style={{width:"8%"}}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {ships.map(s => (
              <tr key={s.id} data-selected={selectedId === s.id} onClick={() => onSelect(s.id)}>
                <td><span className="id">{s.id}</span></td>
                <td><span className="route-txt">{s.from} <span className="arrow">→</span> {s.to}</span></td>
                <td>
                  <div className="cargo-cell">
                    <span style={{color:"var(--fg-1)"}}>{s.cargo}</span>
                    <span className="transport-chip">{(s.transportType ?? "air").toUpperCase()}</span>
                  </div>
                </td>
                <td>
                  <span className={"status-dot " + s.status}>
                    {s.status === "risk" ? "At Risk" : s.status === "rerouted" ? "Rerouted" : s.status === "delayed" ? "Delayed" : "In Transit"}
                  </span>
                </td>
                <td>
                  <div style={{display:"flex", alignItems:"center", gap: 10}}>
                    <div className={"progress" + (s.status === "risk" ? " risk" : s.status === "rerouted" ? " rerouted" : "")}>
                      <span style={{width: `${s.progress*100}%`}}/>
                    </div>
                    <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--fg-2)"}}>{Math.round(s.progress*100)}%</span>
                  </div>
                </td>
                <td>
                  <div className="eta-col">
                    <span className="eta-main">{s.etaIso}</span>
                    <span className={"eta-delta " + (s.delayMin > 0 ? "late" : s.delayMin < 0 ? "saved" : "")}>
                      {s.delayMin > 0 ? `+${Math.floor(s.delayMin/60)}h ${s.delayMin%60}m late` :
                       s.delayMin < 0 ? `${Math.floor(s.delayMin/60)}h ${Math.abs(s.delayMin%60)}m saved` : "on schedule"}
                    </span>
                  </div>
                </td>
                <td style={{fontFamily:"var(--font-mono)", color:"var(--fg-1)", fontSize: 11}}>{s.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, ScopeSelector, StatsStrip, ShipmentsDrawer, Spark });
