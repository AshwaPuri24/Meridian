// ============================================================
// Meridian - Agent Reasoning panel (the hero feature)
// ============================================================

function AgentTag({ agent }) {
  const label = {
    risk: "Intelligence Agent",
    intelligence: "Intelligence Agent",
    route: "Map Agent",
    map: "Map Agent",
    weather: "Weather Agent",
    orchestrator: "Orchestrator",
  }[agent] || agent;
  return <span className="agent-tag" data-agent={agent}>{label}</span>;
}

function formatConfidence(confidenceScore) {
  if (typeof confidenceScore !== "number") return null;
  const pct = Math.round(confidenceScore * 100);
  if (pct >= 85) return `High confidence decision (${pct}%)`;
  if (pct >= 60) return `Moderate confidence decision (${pct}%)`;
  return `Lower confidence decision (${pct}%)`;
}

function renderReadableText(text) {
  return text.split(/(MRD-\d+|HZ-\d+|\$[0-9.,]+k?|\d+%)/g).map((chunk, i) =>
    /^(MRD-\d+|HZ-\d+|\$[0-9.,]+k?|\d+%)$/.test(chunk)
      ? <span key={i} className="mono">{chunk}</span>
      : <React.Fragment key={i}>{chunk}</React.Fragment>
  );
}

function buildReasoningSections(r) {
  const confidence = formatConfidence(r._raw?.confidenceScore);
  const selectedAlternate = r._raw?.selectedAlternate;
  const spoilageAvoided = r._raw?.metrics?.spoilageAvoided_usd;

  const impactBits = [
    `Original ETA ${r.metrics.originalETA}`,
    `Proposed ETA ${r.metrics.proposedETA}`,
    `${r.metrics.savedBad ? "Time impact" : "Time saved"} ${r.metrics.saved}`,
  ];

  if (typeof spoilageAvoided === "number" && spoilageAvoided > 0) {
    impactBits.push(`Estimated cost avoided $${Math.round(spoilageAvoided).toLocaleString()}`);
  }

  return [
    {
      title: "What happened",
      body: r.title,
    },
    {
      title: "Why it matters",
      body: `${r.body}${confidence ? ` ${confidence}.` : ""}`,
    },
    {
      title: "What AI decided",
      body: selectedAlternate
        ? `The AI selected ${selectedAlternate} as the best route option.`
        : r.status === "executed"
          ? "The AI-backed reroute has already been executed."
          : r.status === "approved"
            ? "The AI recommendation has been approved and is ready to act on."
            : "The AI generated a reroute recommendation and is waiting for approval.",
    },
    {
      title: "Impact",
      body: impactBits.join(" • "),
    },
  ];
}

function ReasoningEntry({ r, onApprove, onReject, onSelect }) {
  const [showTechnical, setShowTechnical] = React.useState(false);
  const sections = buildReasoningSections(r);

  return (
    <div className="reasoning-entry" data-status={r.status} onClick={() => onSelect?.(r.shipmentId)}>
      <div className="reasoning-head">
        <AgentTag agent={r.agent}/>
        <span style={{color:"var(--fg-3)"}}>-</span>
        <span>{r.id}</span>
        <span className="timestamp">{r.timestamp} UTC</span>
      </div>

      <div className="reasoning-title">{r.title}</div>

      <div className="reasoning-sections">
        {sections.map(section => (
          <div key={section.title} className="reasoning-section">
            <div className="reasoning-section-title">{section.title}</div>
            <div className="reasoning-body">{renderReadableText(section.body)}</div>
          </div>
        ))}
      </div>

      <div className="reasoning-tech-toggle">
        <button
          className="btn ghost"
          style={{padding:"4px 8px", fontSize:11}}
          onClick={e => {
            e.stopPropagation();
            setShowTechnical(v => !v);
          }}
        >
          {showTechnical ? "Hide technical details" : "View technical details"}
        </button>
      </div>

      {showTechnical && (
        <>
          <div className="trace">
            <div className="trace-label">Agent trace</div>
            {r.agents.map((step, i) => (
              <div key={i} className={"trace-step" + (step.typing ? " typing" : "")} data-done={step.done}>
                <span className="step-idx">{String(i + 1).padStart(2, "0")}</span>
                <span className="step-dot"/>
                <span className="step-text"><AgentTag agent={step.a}/> <span style={{color:"var(--fg-1)", marginLeft: 4}}>{step.msg}</span></span>
              </div>
            ))}
          </div>

          <div className="reasoning-metrics">
            <div className="metric">
              <div className="m-label">Original ETA</div>
              <div className="m-val">{r.metrics.originalETA}</div>
            </div>
            <div className="metric">
              <div className="m-label">Proposed ETA</div>
              <div className="m-val" style={{color: r.metrics.savedBad ? "var(--warn)" : "var(--accent)"}}>{r.metrics.proposedETA}</div>
            </div>
            <div className="metric">
              <div className="m-label">Delta</div>
              <div className={"m-val " + (r.metrics.savedBad ? "" : "saved")} style={r.metrics.savedBad ? {color:"var(--alert)"} : {}}>{r.metrics.saved}</div>
            </div>
          </div>
        </>
      )}

      {r.status === "active" && (
        <div className="reasoning-actions">
          <button className="btn primary" onClick={e => { e.stopPropagation(); onApprove(r.id); }}>
            <Icons.Check size={12}/> Approve reroute
          </button>
          <button
            className="btn danger"
            title="Reject this rerouting proposal and restore shipment to transit"
            onClick={e => { e.stopPropagation(); onReject && onReject(r.id); }}
          >
            <Icons.X size={12}/> Reject
          </button>
          <button className="btn ghost">View details</button>
        </div>
      )}
    </div>
  );
}

function ReasoningPanel({ onSelectShip, onApprove, onReject, entries, containerClassName, onClose }) {
  return (
    <div className={containerClassName || "right"}>
      <div className="right-head">
        <h2><span className="live-dot"/> Agent Reasoning</h2>
        <div style={{display:"flex", gap: 6}}>
          <button className="btn ghost" style={{padding:"4px 8px", fontSize:11}}>
            <Icons.Filter size={12}/>
          </button>
          <button className="btn ghost" style={{padding:"4px 8px", fontSize:11}}>
            <Icons.Settings size={12}/>
          </button>
          {onClose && (
            <button
              className="btn ghost"
              style={{padding:"4px 8px", fontSize:11}}
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              title="Close"
            >
              <Icons.X size={12}/>
            </button>
          )}
        </div>
      </div>
      <div className="right-body">
        <div className="reasoning-list">
          {entries.map(r => (
            <ReasoningEntry
              key={r.id}
              r={r}
              onApprove={onApprove}
              onReject={onReject}
              onSelect={onSelectShip}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ReasoningPanel, ReasoningEntry, AgentTag });
