// ============================================================
// Meridian - AI Action Banner
// ============================================================

function AIActionBanner({ entry }) {
  if (!entry) return null;

  const hazard = window.HAZARDS.find(h => h.id === entry.alertId);
  const rawMetrics = entry._raw?.metrics ?? {};
  const selectedAlternate = entry._raw?.selectedAlternate;
  const disruptionTitle = hazard?.title ?? entry.title;
  const costSaved = rawMetrics.spoilageAvoided_usd ?? rawMetrics.spoilage_avoided_usd;

  const actionText = selectedAlternate
    ? `Shipment rerouted via ${selectedAlternate}`
    : "AI is calculating the safest route";

  const formatCurrency = value => {
    if (typeof value !== "number" || Number.isNaN(value)) return "Calculating";
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
    return `$${Math.round(value).toLocaleString()}`;
  };

  return (
    <section className="ai-action-banner" aria-live="polite">
      <div className="aiab-pulse"/>

      <div className="aiab-copy">
        <div className="aiab-label">AI action</div>
        <div className="aiab-title">Disruption: {disruptionTitle}</div>
        <div className="aiab-action">AI Action: {actionText}</div>
      </div>

      <div className="aiab-impact">
        <div>
          <span className="aiab-k">Time saved</span>
          <strong>{entry.metrics?.saved ?? "Calculating"}</strong>
        </div>
        <div>
          <span className="aiab-k">Cost saved</span>
          <strong>{formatCurrency(costSaved)}</strong>
        </div>
      </div>
    </section>
  );
}

window.AIActionBanner = AIActionBanner;
