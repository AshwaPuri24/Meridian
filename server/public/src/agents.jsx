// ============================================================
// Meridian — Agent Activity view (multi-agent message bus)
// ============================================================

// --- Tiny JSON syntax highlighter ---
function HighlightJson({ obj }) {
  const s = JSON.stringify(obj, null, 2);
  const html = s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="key">$1</span>$2')
    .replace(/: ("(?:[^"\\]|\\.)*")/g, ': <span class="str">$1</span>')
    .replace(/: (true|false|null)/g, ': <span class="kw">$1</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span class="num">$1</span>');
  return <pre dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---- Agent graph (left column) ----
function AgentGraph({ activeLink }) {
  const nodes = {
    weather:      { x: 20,  y: 40,  agent: "weather",      name: "Weather Agent",      model: "gemini-1.5-flash", status: "idle" },
    intelligence: { x: 20,  y: 150, agent: "intelligence", name: "Intelligence Agent", model: "gemini-1.5-pro",   status: "scanning" },
    map:          { x: 20,  y: 260, agent: "map",          name: "Map Agent",          model: "google-directions", status: "idle" },
    orchestrator: { x: 150, y: 380, agent: "orchestrator", name: "Orchestrator",       model: "gemini-1.5-pro",   status: "thinking" },
  };
  const links = [
    ["weather", "orchestrator"],
    ["intelligence", "orchestrator"],
    ["map", "orchestrator"],
  ];
  const anchor = (n) => ({ x: n.x + 70, y: n.y + 44 });
  return (
    <div className="agent-graph">
      <svg className="links" viewBox="0 0 300 500" preserveAspectRatio="none">
        {links.map(([a, b], i) => {
          const na = anchor(nodes[a]), nb = anchor(nodes[b]);
          const mx = (na.x + nb.x) / 2;
          const active = activeLink === a;
          return (
            <path
              key={i}
              d={`M${na.x},${na.y} C${mx},${na.y} ${mx},${nb.y} ${nb.x},${nb.y}`}
              className={"agent-link" + (active ? " active" : "")}
            />
          );
        })}
      </svg>
      {Object.values(nodes).map(n => (
        <div key={n.agent} className="agent-node" data-agent={n.agent}
             style={{ left: n.x, top: n.y }}>
          <span className="an-tag" style={{
            background: `var(--${n.agent === "weather" ? "warn" : n.agent === "intelligence" ? "alert" : n.agent === "map" ? "accent" : "violet"}-dim, var(--bg-3))`,
            color: n.agent === "weather" ? "var(--warn)" : n.agent === "intelligence" ? "var(--alert)" : n.agent === "map" ? "var(--accent)" : "var(--violet)",
          }}>{n.agent}</span>
          <div className="an-name">{n.name}</div>
          <div className="an-model">{n.model}</div>
          <div className="an-stat">{n.status}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Mock live message bus ----
const BASE_MESSAGES = [
  {
    t: "14:31:52.014", from: "weather",
    body: <>POST <span className="key">weather.forecast.push</span> <span className="arrow">→</span> bus.orchestrator
      <pre>{`{
  "station_id": "EGLL",
  "cyclone_id": "HZ-021",
  "category": 3,
  "wind_kts": 82,
  "pressure_mb": 958,
  "eta_landfall_h": 14.2,
  "trajectory": [[60.2,12.8],[62.4,13.9],[65.1,15.2]]
}`}</pre></>,
  },
  {
    t: "14:31:52.891", from: "intelligence",
    body: <>EVALUATE <span className="key">hazard.intersect</span>(shipment=<span className="str">"MRD-48271"</span>, hazard=<span className="str">"HZ-021"</span>)
      <pre>{`{
  "intersect": true,
  "confidence": 0.92,
  "affected_leg_km": 2480,
  "cargo_risk": "pharma-cold-chain-breach",
  "severity": "HIGH"
}`}</pre></>,
  },
  {
    t: "14:31:53.204", from: "map",
    body: <>INVOKE <span className="key">map.evaluate_detours</span>(n=<span className="num">4</span>)
      <pre>{`[
  { "id": "ALT-A", "via": "DXB",  "delta_h": 3.53, "fuel_pct": 2.8, "risk": 0.08 },
  { "id": "ALT-B", "via": "SHJ",  "delta_h": 4.10, "fuel_pct": 3.1, "risk": 0.09 },
  { "id": "ALT-C", "via": "AUH",  "delta_h": 5.80, "fuel_pct": 4.2, "risk": 0.07 },
  { "id": "ALT-D", "via": "south-38", "delta_h": 2.10, "fuel_pct": 1.5, "risk": 0.41 }
]`}</pre></>,
  },
  {
    t: "14:31:53.912", from: "orchestrator", emph: true,
    body: <>RECEIVE <span className="arrow">←</span> weather | intelligence | map <span className="arrow">→</span> <span className="kw">generateSmartReroute</span>()
      <pre>{`// Feeding payload to gemini-1.5-pro...
// StructuredOutputParser<Zod> active
// Awaiting JSON response...`}</pre></>,
  },
  {
    t: "14:31:55.441", from: "orchestrator", emph: true,
    body: <>RESPONSE <span className="arrow">→</span> parsed &amp; validated
      <pre>{`{
  "shipmentId": "MRD-48271",
  "alertId": "HZ-021",
  "selected": "ALT-A",
  "confidence": 0.94,
  "aiReasoning": "DXB bridge balances delay vs. risk…",
  "proposedRoute": [[8.7,50.1],[32.1,37.4],[55.3,25.2],[72.8,19.0]],
  "metrics": { "originalETA_h": 14.83, "proposedETA_h": 18.37, "timeSavedMinutes": -212 },
  "action": "REQUIRES_HUMAN_SIGNOFF"
}`}</pre></>,
  },
  {
    t: "14:32:01.223", from: "intelligence",
    body: <>POLL <span className="key">news.port.rotterdam.queue</span> <span className="arrow">→</span> depth=<span className="num">38h</span> (baseline <span className="num">14h</span>)</>,
  },
  {
    t: "14:32:02.017", from: "weather",
    body: <>STREAM <span className="key">forecast.pacific_38N</span> · storm_front=<span className="str">"active"</span> · clearance_h=<span className="num">8.4</span></>,
  },
  {
    t: "14:32:04.502", from: "orchestrator",
    body: <>DECIDE <span className="arrow">→</span> <span className="key">OPT-4920</span> status=<span className="str">"AUTO_APPROVED"</span> (confidence=<span className="num">0.97</span> &ge; threshold=<span className="num">0.85</span>)</>,
  },
];

function MessageBus({ messages }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);
  return (
    <div className="bus-feed" ref={ref}>
      {messages.map((m, i) => (
        <div key={i} className={"bus-msg" + (m.emph ? " emph" : "")}>
          <div className="bm-time">{m.t}</div>
          <div className="bm-from" data-agent={m.from}>{m.from}</div>
          <div className="bm-body">{m.body}</div>
        </div>
      ))}
    </div>
  );
}

function AgentContractCard() {
  const roles = window.MERIDIAN_AGENT_ROLES || {};
  const ordered = ["orchestrator", "weather", "intelligence", "map"];
  return (
    <div className="agent-contract-card">
      <div className="gauge-title">Integration contract</div>
      <div className="acc-version">{window.MERIDIAN_AGENT_CONTRACT_VERSION || "ui-agent-contract-v1"}</div>
      <div className="acc-grid">
        {ordered.map(function(key) {
          const role = roles[key] || {};
          return (
            <div key={key} className="acc-role" data-agent={key}>
              <span>{role.label || key}</span>
              <small>{role.role || "Agent"}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Orchestrator Thought Process ----
function ThoughtProcess() {
  const promptText = `<span class="com">// PromptTemplate (LangChain)</span>
<span class="key">system:</span> You are Meridian's <span class="hl">Orchestrator Agent</span>. Given a shipment,
        an active hazard, and N alternative routes, select the optimal
        reroute. Return STRICT JSON matching the <span class="tag">OptimizationLog</span>
        schema. You MUST include a confidence score in [0,1].

<span class="key">input:</span>
  shipment: {{ shipment }}
  alert:    {{ alert }}
  alternatives: {{ alternatives }}

<span class="key">constraints:</span>
  - Prefer routes with risk &lt; 0.15
  - Penalize delay by $1,200/hour for refrigerated cargo
  - If confidence &lt; threshold(0.85), set action=REQUIRES_HUMAN_SIGNOFF

<span class="key">output_parser:</span> <span class="kw">StructuredOutputParser</span>&lt;<span class="tag">ZodOptimizationLogSchema</span>&gt;`;

  const parsedOutput = {
    shipmentId: "MRD-48271",
    alertId: "HZ-021",
    selectedAlternate: "ALT-A",
    confidence: 0.94,
    aiReasoning:
      "DXB bridge trades 3h 32m of added transit for a 4x reduction in cold-chain breach probability. Fuel impact (+2.8%) is within carrier budget. All alternates considered; southern-38 rejected due to risk=0.41.",
    proposedRoute: {
      type: "LineString",
      coordinates: [[8.7, 50.1], [32.1, 37.4], [55.3, 25.2], [72.8, 19.0]],
    },
    metrics: {
      originalETA_h: 14.83,
      proposedETA_h: 18.37,
      timeSavedMinutes: -212,
      spoilage_avoided_usd: 42800,
    },
    action: "REQUIRES_HUMAN_SIGNOFF",
    generatedAt: "2026-04-18T14:31:55.441Z",
  };

  return (
    <div className="thought">
      <div className="thought-block">
        <div className="thought-block-head">
          <span className="t-label">Input · Gemini Prompt</span>
          <span className="t-badge">tokens: 1,247</span>
          <span className="t-model">gemini-1.5-pro-latest</span>
        </div>
        <pre className="code-block" dangerouslySetInnerHTML={{ __html: promptText }}/>
      </div>

      <div className="thought-arrow">↓ StructuredOutputParser ↓</div>

      <div className="thought-block">
        <div className="thought-block-head">
          <span className="t-label">Output · Parsed JSON (Zod-validated)</span>
          <span className="t-badge" style={{background:"var(--ok-dim)", color:"var(--ok)"}}>✓ schema ok</span>
          <span className="t-model">latency: 1,527ms</span>
        </div>
        <div className="code-block">
          <HighlightJson obj={parsedOutput}/>
        </div>
      </div>

      <div className="thought-block">
        <div className="thought-block-head">
          <span className="t-label">Decision Gate</span>
          <span className="t-badge" style={{background:"var(--warn-dim)", color:"var(--warn)"}}>REQUIRES HUMAN SIGN-OFF</span>
        </div>
        <div className="code-block">
<span className="com">{`// confidence (0.94) >= threshold (0.85)  → PASSED
// risk-class = "pharma-cold-chain"      → GATED (policy RR-pharma-v3)
// → emit REQUIRES_HUMAN_SIGNOFF to operator queue
// → await PUT /api/optimization/OPT-4921/execute`}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Confidence gauge ----
function ConfidenceGauge({ value, threshold }) {
  const r = 60, cx = 80, cy = 80;
  const circ = Math.PI * r; // half circle
  const offset = circ * (1 - value);
  const band = value >= 0.85 ? "approve" : value >= 0.6 ? "review" : "reject";
  const bandColor = band === "approve" ? "var(--ok)" : band === "review" ? "var(--warn)" : "var(--alert)";
  // threshold marker angle
  const angle = Math.PI * (1 - threshold);
  const tx = cx + r * Math.cos(angle);
  const ty = cy - r * Math.sin(angle);

  return (
    <div className="gauge-wrap">
      <div className="gauge-title">Current decision · OPT-4921</div>
      <div className="gauge-svg-wrap">
        <svg width="160" height="100" viewBox="0 0 160 100">
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--alert)"/>
              <stop offset="50%" stopColor="var(--warn)"/>
              <stop offset="100%" stopColor="var(--ok)"/>
            </linearGradient>
          </defs>
          <path d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
                fill="none" stroke="var(--bg-3)" strokeWidth="10" strokeLinecap="round"/>
          <path d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
                fill="none" stroke="url(#gaugeGrad)" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={offset}/>
          {/* threshold tick */}
          <line x1={tx} y1={ty} x2={cx + (r + 8) * Math.cos(angle)} y2={cy - (r + 8) * Math.sin(angle)}
                stroke="var(--fg-0)" strokeWidth="1.5"/>
          <text x={cx + (r + 16) * Math.cos(angle)} y={cy - (r + 16) * Math.sin(angle)}
                fontFamily="JetBrains Mono" fontSize="8" fill="var(--fg-2)" textAnchor="middle">threshold</text>
        </svg>
      </div>
      <div className="gauge-val" style={{color: bandColor}}>
        {Math.round(value * 100)}<span className="pct">%</span>
      </div>
      <div className={"gauge-label " + band}>
        {band === "approve" ? "Auto-approve" : band === "review" ? "Human sign-off" : "Reject"}
      </div>

      <div className="conf-scale">
        <div className="conf-seg seg-reject" data-active={band === "reject"}>&lt; 60</div>
        <div className="conf-seg seg-review" data-active={band === "review"}>60-85</div>
        <div className="conf-seg seg-approve" data-active={band === "approve"}>&ge; 85</div>
      </div>
    </div>
  );
}

function ConfPanel() {
  const [threshold, setThreshold] = React.useState(0.85);
  const decisions = [
    { opt: "OPT-4922", ship: "MRD-48244", conf: 0.88, state: "auto" },
    { opt: "OPT-4921", ship: "MRD-48271", conf: 0.94, state: "review" },
    { opt: "OPT-4920", ship: "MRD-48259", conf: 0.97, state: "auto" },
    { opt: "OPT-4917", ship: "MRD-48238", conf: 0.62, state: "review" },
    { opt: "OPT-4914", ship: "MRD-48199", conf: 0.41, state: "reject" },
    { opt: "OPT-4912", ship: "MRD-48221", conf: 0.91, state: "auto" },
  ];
  return (
    <div className="conf-panel">
      <ConfidenceGauge value={0.94} threshold={threshold}/>

      <div className="gauge-wrap">
        <div className="gauge-title">Auto-approve threshold</div>
        <div className="threshold-row">
          <span>0.00</span>
          <span style={{color:"var(--fg-0)", fontSize: 12}}>{threshold.toFixed(2)}</span>
          <span>1.00</span>
        </div>
        <input type="range" className="slider" min="0.5" max="0.99" step="0.01" value={threshold}
               onChange={e => setThreshold(parseFloat(e.target.value))}/>
        <div style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--fg-2)", marginTop: 8, lineHeight: 1.5}}>
          decisions ≥ <span style={{color:"var(--ok)"}}>{threshold.toFixed(2)}</span> execute automatically;
          below, they queue for operator review.
        </div>
      </div>

      <div className="decisions-card">
        <div className="gauge-title" style={{margin: 0, display:"flex", alignItems:"center", justifyContent:"space-between"}}>
          <span>Last 6 decisions</span>
          <span className="live-indicator">live</span>
        </div>
        {decisions.map(d => (
          <div key={d.opt} className="decision-row">
            <div>
              <div className="d-ship">{d.ship}</div>
              <div className="d-opt">{d.opt}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div className="d-conf" style={{
                color: d.state === "auto" ? "var(--ok)" : d.state === "review" ? "var(--warn)" : "var(--alert)"
              }}>{d.conf.toFixed(2)}</div>
            </div>
            <div></div>
            <div className="d-tag" data-state={d.state}>
              {d.state === "auto" ? "Auto-Approved" : d.state === "review" ? "Human Sign-off" : "Rejected"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Main view ----
function AgentActivityView() {
  const [tab, setTab] = React.useState("bus");
  const [messages, setMessages] = React.useState(BASE_MESSAGES);

  // stream new messages periodically
  React.useEffect(() => {
    const pool = [
      { from: "weather", body: <>STREAM <span className="key">satellite.atlantic</span> · coverage=<span className="str">"nominal"</span></> },
      { from: "intelligence",    body: <>SCAN <span className="key">news.port.shenzhen.dwell</span> <span className="arrow">→</span> <span className="num">16.4h</span> (baseline)</> },
      { from: "map",   body: <>HEARTBEAT <span className="key">google_maps.directions</span> · quota=<span className="num">92%</span> remaining</> },
      { from: "orchestrator", body: <>IDLE <span className="arrow">→</span> watching 2,847 shipments · 12ms tick</> },
      { from: "intelligence",    body: <>ALERT <span className="key">news.congestion.update</span>(HZ-019) severity=<span className="kw">MEDIUM</span></> },
      { from: "weather", body: <>FORECAST <span className="key">wind.arabian_sea</span> <span className="arrow">→</span> <span className="num">58</span> kt sustained</> },
    ];
    let i = 0;
    const id = setInterval(() => {
      const now = new Date();
      const t = `14:32:${String(10 + (i * 3) % 50).padStart(2, "0")}.${String((i * 137) % 1000).padStart(3, "0")}`;
      const msg = { ...pool[i % pool.length], t };
      setMessages(m => [...m, msg].slice(-30));
      i++;
    }, 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="agents-view" data-screen-label="03 Agent Activity">
      {/* LEFT — agent graph */}
      <div className="agents-col">
        <div className="agents-col-head">
          <div className="ttl">Agent Network</div>
          <div className="sub">4 online · gemini-1.5</div>
        </div>
        <AgentGraph activeLink={messages[messages.length - 1]?.from}/>

        <div style={{padding: "var(--s-4)", borderTop: "1px solid var(--line-1)"}}>
          <AgentContractCard/>
          <div className="gauge-title" style={{marginBottom: 10}}>Throughput · last hour</div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 8, fontSize: 11}}>
            <div>
              <div style={{fontFamily:"var(--font-mono)", color:"var(--fg-2)", fontSize: 10}}>MESSAGES</div>
              <div style={{fontSize: 18, fontWeight: 500}}>14,223</div>
            </div>
            <div>
              <div style={{fontFamily:"var(--font-mono)", color:"var(--fg-2)", fontSize: 10}}>DECISIONS</div>
              <div style={{fontSize: 18, fontWeight: 500}}>312</div>
            </div>
            <div>
              <div style={{fontFamily:"var(--font-mono)", color:"var(--fg-2)", fontSize: 10}}>AUTO-APPROVED</div>
              <div style={{fontSize: 18, fontWeight: 500, color: "var(--ok)"}}>264</div>
            </div>
            <div>
              <div style={{fontFamily:"var(--font-mono)", color:"var(--fg-2)", fontSize: 10}}>ESCALATED</div>
              <div style={{fontSize: 18, fontWeight: 500, color: "var(--warn)"}}>48</div>
            </div>
          </div>
        </div>
      </div>

      {/* CENTER — tabs */}
      <div className="agents-col">
        <div className="bus-tabs">
          <button className="bus-tab" data-active={tab === "bus"} onClick={() => setTab("bus")}>
            Message Bus
          </button>
          <button className="bus-tab" data-active={tab === "thought"} onClick={() => setTab("thought")}>
            Orchestrator Thought Process
          </button>
          <div style={{marginLeft:"auto", display:"flex", alignItems:"center", padding:"0 var(--s-4)"}}>
            <span className="live-indicator">streaming</span>
          </div>
        </div>
        {tab === "bus" ? <MessageBus messages={messages}/> : <ThoughtProcess/>}
      </div>

      {/* RIGHT — confidence */}
      <div className="agents-col">
        <div className="agents-col-head">
          <div className="ttl">Confidence &amp; Gating</div>
          <div className="sub">Human-in-the-loop policy</div>
        </div>
        <ConfPanel/>
      </div>
    </div>
  );
}

window.AgentActivityView = AgentActivityView;
