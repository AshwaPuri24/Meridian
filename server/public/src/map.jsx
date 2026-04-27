// ============================================================
// Meridian — World map with shipments, routes, hazard zones
// ============================================================

function WorldMap({ shipments, selectedId, onSelect, rerouteActive, simulatedReroute }) {
  const [hover, setHover] = React.useState(null);
  const focusMode = true;

  const getFocusRouteColor = (s, rerouted) => {
    if (s.status === "risk") return "#FF4D4D";
    if (rerouted) return "#00F5FF";
    return "var(--accent)";
  };

  const getRouteStyle = (s, isSel, rerouted) => {
    if (!focusMode) return {};

    const important = s.status === "risk" || rerouted || isSel;
    if (!important) {
      return {
        opacity: 0.14,
        strokeWidth: 1,
        stroke: "var(--fg-3)",
        filter: "none",
      };
    }

    const stroke = getFocusRouteColor(s, rerouted);
    return {
      opacity: 1,
      stroke,
      strokeWidth: isSel ? 3 : 2.3,
      filter: isSel ? `drop-shadow(0 1px 3px rgba(15, 23, 42, 0.14))` : "none",
    };
  };

  const getRouteFlowStyle = (s, rerouted) => {
    if (!focusMode) return {};

    return {
      opacity: 1,
      stroke: getFocusRouteColor(s, rerouted),
      strokeWidth: 3.2,
    };
  };

  return (
    <div className="map-wrap">
      <div className="map-grid" />

      <svg
        className="map-svg"
        viewBox="0 0 1000 500"
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: "100%",
          height: "auto",
        }}
      >
        <defs>
          <radialGradient id="hazGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--alert)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--alert)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hazGradWarn" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--warn)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--warn)" stopOpacity="0" />
          </radialGradient>
          <filter id="softGlow"><feGaussianBlur stdDeviation="1.5" /></filter>
        </defs>

        {/* latitude guides */}
        {[-60,-30,0,30,60].map(lat => {
          const [,y] = window.project(0, lat);
          return <line key={lat} x1="0" x2="1000" y1={y} y2={y} stroke="var(--line-1)" strokeWidth="0.5" strokeDasharray="2 6" opacity="0.6"/>;
        })}

        {/* continents */}
        {window.continentPaths.map((pts, i) => (
          <polygon key={i} points={pts} className="continent-path" />
        ))}

        {/* hazard zones */}
        {window.HAZARDS.map(h => {
          const pts = h.points.map(p => p.join(",")).join(" ");
          const [cx, cy] = h.points.reduce((a,p) => [a[0]+p[0], a[1]+p[1]], [0,0]).map(v => v / h.points.length);
          return (
            <g key={h.id}
               onMouseEnter={() => setHover({ type: "hazard", x: cx, y: cy, data: h })}
               onMouseLeave={() => setHover(null)}>
              <polygon points={pts} className={"hazard-zone" + (h.type === "Weather" ? " weather" : "")} />
              <circle cx={cx} cy={cy} r="28" fill={`url(#${h.type === "Weather" ? "hazGradWarn" : "hazGrad"})`} />
              <text x={cx} y={cy - 30} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8" fill={h.type === "Weather" ? "var(--warn)" : "var(--alert)"} letterSpacing="0.1em">
                {h.type.toUpperCase()} · {h.severity.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* routes */}
        {shipments.map(s => {
          const isSel = s.id === selectedId;
          const rerouted = s.status === "rerouted" || (simulatedReroute && s.id === simulatedReroute.shipmentId);
          const routeStyle = getRouteStyle(s, isSel, rerouted);
          return (
            <g key={s.id} opacity={focusMode ? 1 : (isSel || !selectedId ? 1 : 0.35)}>
              <path
                d={s._path}
                className={"route-line" + (rerouted ? " rerouted" : "")}
                style={routeStyle}
              />
              {isSel && (
                <path
                  d={s._path}
                  className="route-flow"
                  style={getRouteFlowStyle(s, rerouted)}
                />
              )}
            </g>
          );
        })}

        {/* simulated reroute overlay — animated alternate path */}
        {simulatedReroute && (
          <g>
            <path d={simulatedReroute.originalPath} className="route-line original" />
            <path d={simulatedReroute.newPath} className="route-line rerouted" style={{strokeDasharray: "220", strokeDashoffset: "220", animation: "drawPath 1.2s ease forwards"}} />
          </g>
        )}

        {/* city hubs */}
        {window.CITIES.map(c => {
          const [x, y] = window.project(c.lon, c.lat);
          return (
            <g key={c.code}>
              <circle cx={x} cy={y} r="1.8" className="city-dot" />
              <text x={x + 5} y={y + 3} className="city-label">{c.code}</text>
            </g>
          );
        })}

        {/* ships along routes */}
        {shipments.map(s => {
          const [x, y] = s._pos;
          const isSel = s.id === selectedId;
          const cls = "ship-node " + s.status;
          return (
            <g key={s.id} className={cls} transform={`translate(${x},${y})`}
               onMouseEnter={() => setHover({ type: "ship", x, y, data: s })}
               onMouseLeave={() => setHover(null)}
               onClick={() => onSelect(s.id)}>
              <circle className="glow" r={isSel ? 14 : 10} />
              <circle className="dot" r={isSel ? 5 : 3.5} />
            </g>
          );
        })}
      </svg>

      {/* tooltip */}
      {hover && (
        <div className="map-tooltip" style={{ left: `${(hover.x/1000)*100}%`, top: `${(hover.y/500)*100}%` }}>
          {hover.type === "ship" ? (
            <>
              <div className="tt-title">{hover.data.id}</div>
              <div className="tt-row">{hover.data.from} → {hover.data.to} · {hover.data.cargo}</div>
              <div className="tt-row">ETA {hover.data.etaIso} · {Math.round(hover.data.progress*100)}% complete</div>
            </>
          ) : (
            <>
              <div className="tt-title">{hover.data.title}</div>
              <div className="tt-row">{hover.data.type} · severity {hover.data.severity}</div>
              <div className="tt-row">Affects {hover.data.affects.length} shipments</div>
            </>
          )}
        </div>
      )}

      {/* map controls */}
      <div className="map-overlay map-controls">
        <button className="map-btn" title="Zoom in">+</button>
        <button className="map-btn" title="Zoom out">−</button>
        <button className="map-btn" title="Layers"><Icons.Layers size={14}/></button>
        <button className="map-btn" title="Recenter"><Icons.Globe size={14}/></button>
      </div>

      {/* legend */}
      <div className="map-overlay map-legend">
        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--fg-2)", letterSpacing:"0.08em", marginBottom: 6, textTransform:"uppercase"}}>Legend</div>
        <div className="legend-row"><span className="legend-swatch route"/> Active route</div>
        <div className="legend-row"><span className="legend-swatch reroute"/> AI reroute</div>
        <div className="legend-row"><span className="legend-swatch hazard"/> Hazard zone</div>
        <div className="legend-row"><span className="legend-swatch shipment"/> Shipment</div>
      </div>

      <style>{`
        @keyframes drawPath { to { stroke-dashoffset: 0; } }
      `}</style>
    </div>
  );
}

window.WorldMap = WorldMap;
