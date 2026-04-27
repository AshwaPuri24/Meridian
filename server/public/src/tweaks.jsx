// ============================================================
// Meridian — Tweaks panel
// ============================================================

function Tweaks({ tweaks, setTweaks, onClose }) {
  const set = (k, v) => setTweaks(t => ({ ...t, [k]: v }));

  const accents = [
    { id: "cyan",   color: "#4cd5ff" },
    { id: "lime",   color: "#bef264" },
    { id: "amber",  color: "#fbbf24" },
    { id: "violet", color: "#a78bfa" },
  ];

  return (
    <div className="tweaks">
      <div className="tweaks-head">
        <div className="tweaks-title">Tweaks</div>
        <button className="btn ghost" style={{padding:"2px 6px"}} onClick={onClose}><Icons.X size={12}/></button>
      </div>
      <div className="tweaks-body">
        <div className="tweak-row">
          <div className="tweak-label">Theme</div>
          <div className="seg">
            {["dark","light"].map(t => (
              <button key={t} data-active={tweaks.theme === t} onClick={() => set("theme", t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="tweak-row">
          <div className="tweak-label">Accent</div>
          <div className="swatches">
            {accents.map(a => (
              <div key={a.id} className="swatch" data-active={tweaks.accent === a.id}
                   style={{background: a.color}}
                   onClick={() => set("accent", a.id)}/>
            ))}
          </div>
        </div>
        <div className="tweak-row">
          <div className="tweak-label">Density</div>
          <div className="seg">
            {["comfortable","compact"].map(t => (
              <button key={t} data-active={tweaks.density === t} onClick={() => set("density", t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="tweak-row switch">
          <div className="tweak-label">Map grid</div>
          <div className="toggle" data-on={tweaks.showGrid} onClick={() => set("showGrid", !tweaks.showGrid)}/>
        </div>
        <div className="tweak-row switch">
          <div className="tweak-label">Reasoning panel</div>
          <div className="toggle" data-on={tweaks.showReasoning} onClick={() => set("showReasoning", !tweaks.showReasoning)}/>
        </div>
      </div>
    </div>
  );
}

window.Tweaks = Tweaks;
