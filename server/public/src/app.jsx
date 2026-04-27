// ============================================================
// Meridian — main App
// ============================================================
// Live API integration:
//   - On mount: fetches /api/map-state and merges live data into
//     React state (shipments, alerts) then also syncs window globals
//     for legacy components that still read from window.SHIPMENTS.
//   - Subscribes to GET /api/events (SSE) for instant push updates
//     on simulation completion and reroute execution/rejection.
//     Falls back to 30s polling if SSE is unavailable.
//   - Fetches /api/kpis on mount to replace hardcoded KPI values.
//   - "Simulate disruption" calls POST /api/simulate.
//     Falls back to the built-in demo animation when the backend is
//     offline (e.g. missing .env credentials).
//   - "Execute reroute" fires PUT /api/optimize/:id/execute.
//   - "Reject reroute"  fires PUT /api/optimize/:id/reject.
// ============================================================

const SIMULATION_STEPS = [
  { title: "Hazard detected",      detail: "A disruption has been identified on an active lane." },
  { title: "Route affected",       detail: "The shipment path is now marked as at risk." },
  { title: "AI calculates reroute",detail: "Meridian is evaluating the safest alternate route." },
  { title: "Reroute applied",      detail: "The updated route has been committed to the shipment." },
];

function SimulationStepFlow({ currentStep }) {
  if (currentStep === null || currentStep === undefined) return null;

  const activeStep = SIMULATION_STEPS[currentStep] ?? SIMULATION_STEPS[0];

  return (
    <section className="sim-step-flow" aria-live="polite">
      <div className="sim-step-copy">
        <div className="sim-step-label">Simulation progress</div>
        <div className="sim-step-title">{activeStep.title}</div>
        <div className="sim-step-detail">{activeStep.detail}</div>
      </div>

      <div className="sim-step-track" role="list" aria-label="Simulation steps">
        {SIMULATION_STEPS.map((step, index) => {
          const state = index < currentStep ? "done" : index === currentStep ? "active" : "idle";
          return (
            <div key={step.title} className="sim-step" data-state={state} role="listitem">
              <span className="sim-step-index">{index + 1}</span>
              <span className="sim-step-text">{step.title}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Live clock for the agents view header ─────────────────────
function useLiveClock() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatUtcHeader(date) {
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const m  = months[date.getUTCMonth()];
  const d  = String(date.getUTCDate()).padStart(2, "0");
  const y  = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${m} ${d}, ${y} · ${hh}:${mm} UTC`;
}

function App() {
  const [tweaks, setTweaks]             = React.useState(() => {
    // Merge any persisted theme preference over the compiled defaults
    const savedTheme = localStorage.getItem("meridian-theme");
    return { ...window.__TWEAKS__, ...(savedTheme ? { theme: savedTheme } : {}) };
  });
  const [tweaksOpen, setTweaksOpen]     = React.useState(false);
  const [selectedId, setSelectedId]     = React.useState("MRD-48271");
  const [filter, setFilter]             = React.useState("all");
  const [transportType, setTransportType] = React.useState("all");
  const [view, setView]                 = React.useState("overview");
  const [scope, setScope]               = React.useState("global");
  const [simActive, setSimActive]       = React.useState(false);
  const [simBanner, setSimBanner]       = React.useState(false);
  const [simStepIndex, setSimStepIndex] = React.useState(null);
  const [entries, setEntries]           = React.useState(window.REASONING);
  const [simReroute, setSimReroute]     = React.useState(null);
  const [drawerId, setDrawerId]         = React.useState(null);
  const [execModal, setExecModal]       = React.useState(null); // { ship, optLog }
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isAgentOpen, setIsAgentOpen]     = React.useState(false);
  // Live KPIs — null until the API responds
  const [kpis, setKpis]                 = React.useState(null);
  // Incremented whenever live data arrives; causes WorldMap / ShipmentsDrawer to re-render
  const [refreshKey, setRefreshKey]     = React.useState(0);

  const simStepTimeoutsRef = React.useRef([]);
  const liveClock          = useLiveClock();

  const closeOverlays = React.useCallback(() => {
    setIsSidebarOpen(false);
    setIsAgentOpen(false);
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setIsSidebarOpen((v) => {
      const next = !v;
      if (next) setIsAgentOpen(false);
      return next;
    });
  }, []);

  const toggleAgent = React.useCallback(() => {
    setIsAgentOpen((v) => {
      const next = !v;
      if (next) setIsSidebarOpen(false);
      return next;
    });
  }, []);

  // Escape closes both drawers
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") closeOverlays();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeOverlays]);

  // Mobile rule: agent drawer is not available at <=768px
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => {
      if (mq.matches) setIsAgentOpen(false);
    };
    onChange();
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // ── Simulation step helpers ──────────────────────────────────
  const clearSimulationSteps = React.useCallback(() => {
    simStepTimeoutsRef.current.forEach(clearTimeout);
    simStepTimeoutsRef.current = [];
  }, []);

  const setSimulationStepWithDelay = React.useCallback((stepIndex, delay) => {
    const id = setTimeout(() => setSimStepIndex(stepIndex), delay);
    simStepTimeoutsRef.current.push(id);
  }, []);

  const startSimulationFlow = React.useCallback(() => {
    clearSimulationSteps();
    setSimStepIndex(0);
    setSimulationStepWithDelay(1, 900);
    setSimulationStepWithDelay(2, 1900);
  }, [clearSimulationSteps, setSimulationStepWithDelay]);

  const finishSimulationFlow = React.useCallback(() => {
    clearSimulationSteps();
    setSimStepIndex(3);
    setSimulationStepWithDelay(null, 2800);
  }, [clearSimulationSteps, setSimulationStepWithDelay]);

  React.useEffect(() => () => clearSimulationSteps(), [clearSimulationSteps]);

  // ── Theme / density — apply to <html> + persist choice ──────
  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme",     tweaks.theme);
    root.setAttribute("data-accent",    tweaks.accent);
    root.setAttribute("data-density",   tweaks.density);
    root.setAttribute("data-show-grid", tweaks.showGrid);
    localStorage.setItem("meridian-theme", tweaks.theme);
  }, [tweaks]);

  // ── Theme toggle helper ──────────────────────────────────────
  const toggleTheme = React.useCallback(() => {
    setTweaks(t => ({ ...t, theme: t.theme === "light" ? "dark" : "light" }));
  }, []);

  // ── Edit-mode postMessage protocol ──────────────────────────
  React.useEffect(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "__activate_edit_mode")   setTweaksOpen(true);
      if (e.data.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  React.useEffect(() => {
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: tweaks }, "*");
  }, [tweaks]);

  // ── Live data helpers ────────────────────────────────────────
  /**
   * Safely merge adapted server data into React state AND keep the
   * window globals in sync for legacy components.
   * Uses immutable array operations — no in-place mutation.
   */
  function applyLiveData({ shipments, alerts, logs }) {
    // Merge shipments: replace by id, append if new
    const nextShipments = [...window.SHIPMENTS];
    shipments.forEach(s => {
      const idx = nextShipments.findIndex(x => x.id === s.id);
      if (idx >= 0) nextShipments[idx] = { ...nextShipments[idx], ...s };
      else nextShipments.push(s);
    });
    window.SHIPMENTS = nextShipments;

    // Merge alerts: replace by id, prepend if new
    let nextAlerts = [...window.HAZARDS];
    alerts.forEach(a => {
      const idx = nextAlerts.findIndex(x => x.id === a.id);
      if (idx >= 0) nextAlerts[idx] = { ...nextAlerts[idx], ...a };
      else nextAlerts = [a, ...nextAlerts];
    });
    window.HAZARDS = nextAlerts;

    // Merge logs into entries state (immutable)
    setEntries(prev => {
      const next = [...prev];
      logs.forEach(log => {
        const idx = next.findIndex(e => e.id === log.id);
        if (idx >= 0) next[idx] = { ...next[idx], ...log };
        else next.unshift(log);
      });
      // Sync window global too
      window.REASONING = next;
      return next;
    });

    setRefreshKey(k => k + 1);
  }

  // ── Initial data load + KPIs ─────────────────────────────────
  React.useEffect(() => {
    async function loadInitial() {
      try {
        const [mapData, kpiData] = await Promise.all([
          window.MeridianAPI.getMapState(),
          window.MeridianAPI.getKpis().catch(() => null),
        ]);
        applyLiveData(mapData);
        if (kpiData) {
          setKpis(kpiData);
          // Keep window.KPIS in sync for any legacy reference
          window.KPIS = kpiData;
        }
      } catch (err) {
        console.warn("[Meridian] Initial load failed — using static data:", err.message);
      }
    }
    loadInitial();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling (10s) — keeps all clients in sync ────────────────
  React.useEffect(() => {
    const id = setInterval(async () => {
      try {
        const data = await window.MeridianAPI.getMapState();
        applyLiveData(data);
      } catch { /* offline — silent */ }
    }, 10_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Static fallback demo ─────────────────────────────────────
  function runStaticDemo() {
    startSimulationFlow();
    setSimBanner(true);
    const ship = window.SHIPMENTS.find(s => s.id === "MRD-48244");
    if (ship) {
      const altPath = window.arcPath(
        window.cityByCode[ship.from],
        window.cityByCode[ship.to],
        -0.35
      );
      setSimReroute({ shipmentId: ship.id, originalPath: ship._path, newPath: altPath });
      setSelectedId(ship.id);
    }

    const demoEntry = {
      id: "OPT-4922",
      status: "active",
      agent: "orchestrator",
      timestamp: new Date().toTimeString().slice(0, 8),
      title: "Hurricane Beatriz detected — MRD-48244 on intercept course",
      shipmentId: "MRD-48244",
      alertId: "HZ-NEW",
      body: (
        "Caribbean low-pressure system escalated to hurricane in last 18 minutes. Trajectory intersects " +
        "MRD-48244 corridor in 6h. Map Agent proposes northern arc via BWI — adds 3h 10m but avoids " +
        "92% probability of cargo spoilage on refrigerated produce."
      ),
      metrics: { originalETA: "T+4h 12m", proposedETA: "T+7h 22m", saved: "-3h 10m", savedBad: true },
      agents: [
        { a: "weather", msg: "Hurricane Beatriz · category 2 · heading N-NW.", done: true },
        { a: "intelligence",    msg: "Cargo is temperature-critical; spoilage p=0.92.", done: true },
        { a: "map",   msg: "Evaluating 3 alternates…", done: false, typing: true },
      ],
    };
    setEntries(es => {
      const next = [demoEntry, ...es.filter(e => e.id !== demoEntry.id)];
      window.REASONING = next;
      return next;
    });

    setTimeout(() => {
      setEntries(es => es.map(e => e.id === "OPT-4922" ? {
        ...e,
        agents: [
          { a: "weather",      msg: "Hurricane Beatriz · category 2 · heading N-NW.", done: true },
          { a: "intelligence",         msg: "Cargo is temperature-critical; spoilage p=0.92.", done: true },
          { a: "map",        msg: "Selected northern arc via BWI. Fuel +4.2%, delay +3h 10m.", done: true },
          { a: "orchestrator", msg: "Awaiting operator approval…", done: false, typing: true },
        ],
      } : e));
    }, 2600);
  }

  // ── Simulate disruption ───────────────────────────────────────
  const simulate = async () => {
    if (simActive) {
      clearSimulationSteps();
      setSimActive(false);
      setSimBanner(false);
      setSimStepIndex(null);
      setSimReroute(null);
      return;
    }
    setSimActive(true);
    const startTime = Date.now();
    startSimulationFlow();

    try {
      const entry = await window.MeridianAPI.simulate();
      const ship  = window.SHIPMENTS.find(s => s.id === entry.shipmentId);

      setEntries(es => {
        const next = [entry, ...es.filter(e => e.id !== entry.id)];
        window.REASONING = next;
        return next;
      });

      if (ship) {
        const newPath = entry._proposedSvgPath ??
          window.arcPath(window.cityByCode[ship.from], window.cityByCode[ship.to], -0.3);
        setSimReroute({ shipmentId: ship.id, originalPath: ship._path, newPath });
        setSelectedId(ship.id);

        // Optimistically update local status (server already persisted it)
        const nextShipments = window.SHIPMENTS.map(s =>
          s.id === ship.id ? { ...s, status: "risk" } : s
        );
        window.SHIPMENTS = nextShipments;
      }

      setSimBanner(true);
      setRefreshKey(k => k + 1);

      // Advance to "Reroute applied" (step 3), ensuring step 2 has been
      // visible for at least a moment — fire at ~t=2200ms from click.
      const elapsed = Date.now() - startTime;
      setTimeout(finishSimulationFlow, Math.max(200, 2200 - elapsed));

    } catch (err) {
      console.warn("[Meridian] POST /api/simulate failed — running demo:", err.message);
      setSimActive(true);
      runStaticDemo();
    }
  };

  // ── Approve reroute ──────────────────────────────────────────
  const approve = (id) => {
    const r = entries.find(e => e.id === id);
    if (!r) return;
    const ship = window.SHIPMENTS.find(s => s.id === r.shipmentId);
    if (ship) {
      setExecModal({ ship, optLog: r });
    } else {
      setEntries(es => es.map(e => e.id === id ? { ...e, status: "approved" } : e));
    }
  };

  // ── Reject reroute ───────────────────────────────────────────
  const reject = (id) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    // Optimistic update
    setEntries(es => es.map(e =>
      e.id === id ? { ...e, status: "monitoring" } : e
    ));

    // Persist to server if this is a real log
    if (entry._raw) {
      window.MeridianAPI.rejectReroute(id)
        .then(() => {
          // Restore the affected shipment to transit in local state
          const nextShipments = window.SHIPMENTS.map(s =>
            s.id === entry.shipmentId ? { ...s, status: "transit" } : s
          );
          window.SHIPMENTS = nextShipments;
          setRefreshKey(k => k + 1);
        })
        .catch(err => {
          console.warn("[Meridian] rejectReroute error:", err.message);
          // Revert optimistic update on failure
          setEntries(es => es.map(e =>
            e.id === id ? { ...e, status: "active" } : e
          ));
        });
    }
  };

  // ── Execute reroute (from modal) ─────────────────────────────
  const executeConfirm = (shipId, optId) => {
    const entry = entries.find(e => e.id === optId);
    if (entry && entry._raw) {
      window.MeridianAPI.executeReroute(optId)
        .catch(err => console.warn("[Meridian] executeReroute error:", err.message));
    }

    setEntries(es => es.map(e => e.id === optId ? { ...e, status: "executed" } : e));
    finishSimulationFlow();
    setSimBanner(false);
    setExecModal(null);
    setDrawerId(shipId);
  };

  const openDrawer = (id) => {
    setSelectedId(id);
    setDrawerId(id);
  };

  const isAgents    = view === "agents";
  const isGlobalMap = view === "globalmap";

  // Derive scope-filtered shipments
  const activeEntry      = entries.find(e => e.status === "active");
  const latestActionEntry = entries.find(e =>
    /^MRD-\d+/.test(e.shipmentId ?? "") && e.status === "active"
  );

  const visibleShipments = window.SHIPMENTS.filter(s => {
    const matchesTransport = transportType === "all" || s.transportType === transportType;
    const matchesScope =
      scope === "global"
        ? true
        : scope === "country"
          ? s.country === (window.__SELECTED_COUNTRY__ ?? "India")
          : s.city    === (window.__SELECTED_CITY__    ?? "Mumbai");
    return matchesTransport && matchesScope;
  });

  return (
    <div className="app" data-screen-label={isAgents ? "03 Agent Activity" : isGlobalMap ? "02 Global Map" : "01 Operations Dashboard"}>
      {isSidebarOpen && (
        <div className={"sidebar-drawer" + (isSidebarOpen ? " open" : "")}>
          <Sidebar
            activeView={view}
            onView={setView}
            open={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />
        </div>
      )}

      {(isSidebarOpen || isAgentOpen) && (
        <div className="overlay" onClick={closeOverlays} />
      )}

      {isAgents ? (
        <>
          <header className="topbar">
            <button
              className="btn ghost topbar-burger"
              onClick={toggleSidebar}
              title="Open menu"
              style={{padding: "6px 8px"}}
              type="button"
            >
              <Icons.Menu size={16}/>
            </button>
            <div className="topbar-title">
              <h1>Agent Activity · Multi-Agent Orchestration</h1>
              <small>{formatUtcHeader(liveClock)} · GEMINI-2.0-FLASH</small>
            </div>
            <div className="topbar-divider"/>
            <div className="kpi-chip">
              <span className="label">Messages/hr</span>
              <span className="val">14,223</span>
              <span className="delta up">▲ 8%</span>
            </div>
            <div className="kpi-chip">
              <span className="label">Avg latency</span>
              <span className="val">1.52s</span>
            </div>
            <div className="kpi-chip">
              <span className="label">Auto-approve rate</span>
              <span className="val" style={{color:"var(--ok)"}}>84.6%</span>
            </div>
            <div className="topbar-spacer"/>
            <div className="topbar-search">
              <Icons.Search size={13}/>
              <input placeholder="Filter by agent, shipment, decision…"/>
              <kbd>⌘K</kbd>
            </div>
            <button
              className="btn ghost theme-toggle"
              onClick={toggleTheme}
              title={tweaks.theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              style={{padding:"6px 8px"}}
            >
              {tweaks.theme === "light" ? <Icons.Moon size={14}/> : <Icons.Sun size={14}/>}
            </button>
            <button
              className="btn topbar-agent-toggle"
              onClick={toggleAgent}
              type="button"
            >
              <Icons.Brain size={13}/> Agent Reasoning
            </button>
            <button className="btn" onClick={() => setView("overview")}>
              <Icons.Map size={13}/> Back to Map
            </button>
          </header>

          <div className="main" style={{display:"flex", flexDirection:"column"}}>
            <AgentActivityView kpis={kpis}/>
          </div>
        </>
      ) : isGlobalMap ? (
        <>
          <Topbar
            onSimulate={simulate}
            simActive={simActive}
            scope={scope}
            onScopeChange={setScope}
            theme={tweaks.theme}
            onToggleTheme={toggleTheme}
            onToggleSidebar={toggleSidebar}
            onToggleAgent={toggleAgent}
          />
          <GlobalMapView onBack={() => setView("overview")}/>
        </>
      ) : (
        <>
          <Topbar
            onSimulate={simulate}
            simActive={simActive}
            scope={scope}
            onScopeChange={setScope}
            theme={tweaks.theme}
            onToggleTheme={toggleTheme}
            onToggleSidebar={toggleSidebar}
            onToggleAgent={toggleAgent}
          />
          <div className="main">

            <AIActionBanner entry={latestActionEntry}/>
            <SimulationStepFlow currentStep={simStepIndex}/>

            {simBanner && (
              <div className="alert-banner">
                <span className="ab-dot"/>
                <span className="ab-label">New disruption</span>
                <span className="ab-text">
                  {activeEntry
                    ? <>{activeEntry.title} · Map Agent is evaluating alternate routes…</>
                    : <>AI agent detected a new hazard · Map Agent evaluating alternates…</>
                  }
                </span>
                <span className="ab-spacer"/>
                <button className="btn" style={{fontSize:11, padding:"4px 8px"}} onClick={() => setSimBanner(false)}>
                  Dismiss
                </button>
              </div>
            )}

            {/* ============================================================
                REDESIGNED OVERVIEW DASHBOARD
                Defined in dashboard.jsx, exposed on window.Dashboard.
                ============================================================ */}
            <Dashboard
              shipments={visibleShipments}
              selectedId={selectedId}
              onSelectShipment={openDrawer}
              onExpandMap={() => setView("globalmap")}
              onSimulate={simulate}
              onViewImpact={() => setView("alerts")}
              onOpenAgent={toggleAgent}
              entries={entries}
              kpis={kpis}
            />
          </div>

          {drawerId && (
            <ShipDrawer
              shipmentId={drawerId}
              onClose={() => setDrawerId(null)}
              onExecute={(ship, optLog) => setExecModal({ ship, optLog })}
            />
          )}

          {execModal && (
            <ExecuteRerouteModal
              ship={execModal.ship}
              optLog={execModal.optLog}
              onCancel={() => setExecModal(null)}
              onConfirm={executeConfirm}
            />
          )}
        </>
      )}

      {tweaks.showReasoning && isAgentOpen && (
        <div className={"agent-drawer" + (isAgentOpen ? " open" : "")}>
          <ReasoningPanel
            entries={entries}
            onSelectShip={id => id && id !== "—" && openDrawer(id)}
            onApprove={approve}
            onReject={reject}
            onClose={() => setIsAgentOpen(false)}
          />
        </div>
      )}

      {tweaksOpen && <Tweaks tweaks={tweaks} setTweaks={setTweaks} onClose={() => setTweaksOpen(false)}/>}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
