import type { DecisionState, LearningViewModel } from "@/lib/presentation/manus-contracts";
import { Icon } from "@/components/manus/ui/Icons";
import { Eyebrow, StatePill } from "@/components/manus/ui/Primitives";

function ConfidenceHistory({ data }: { data: LearningViewModel }) {
  const points = data.confidenceHistory;
  const width = 780;
  const height = 176;
  const left = 24;
  const right = 756;
  const top = 20;
  const bottom = 140;
  const xFor = (index: number) => points.length < 2 ? (left + right) / 2 : left + (index / (points.length - 1)) * (right - left);
  const yFor = (value: number) => bottom - ((value - data.confidenceRangeMin) / (data.confidenceRangeMax - data.confidenceRangeMin)) * (bottom - top);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index)} ${yFor(point.value)}`).join(" ");
  return <section className="history-card">
    <div className="history-head"><div><Eyebrow>MEASURE / CONFIDENCE HISTORY</Eyebrow><h2>Confidence evolves with observed error.</h2></div><span className="history-range">{data.confidenceRangeLabel}</span></div>
    <div className={`history-chart${points.length ? " has-history" : " is-empty"}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={points.length ? "Measured model confidence history" : "No Simulated confidence history recorded yet"}>
        <line x1={left} x2={right} y1={top} y2={top} className="history-gridline" />
        <line x1={left} x2={right} y1={(top + bottom) / 2} y2={(top + bottom) / 2} className="history-gridline" />
        <line x1={left} x2={right} y1={bottom} y2={bottom} className="history-gridline" />
        {points.length > 1 && <path d={path} className="history-trace" />}
        {points.map((point, index) => <g key={`${point.label}-${index}`}><circle cx={xFor(index)} cy={yFor(point.value)} r="4" className="history-point"><title>{`${point.label}: ${point.displayValue}`}</title></circle><text x={xFor(index)} y={height - 8} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{point.label}</text></g>)}
      </svg>
      {!points.length && <div className="history-empty"><span className="history-empty-mark"><Icon name="trend" /></span><strong>No simulation completed yet</strong><p>Confidence history appears after an approved simulation measures prediction error.</p></div>}
    </div>
  </section>;
}

function ConfidenceBand({ data }: { data: LearningViewModel }) {
  const clamped = Math.min(data.confidenceRangeMax, Math.max(data.confidenceRangeMin, data.confidenceNumericValue));
  const position = ((clamped - data.confidenceRangeMin) / (data.confidenceRangeMax - data.confidenceRangeMin)) * 100;
  return <section className="confidence-band-card">
    <div className="confidence-band-head"><div><Eyebrow>MODEL / CURRENT STATE</Eyebrow><h2>{data.modelName}</h2></div><StatePill tone="opportunity">{data.confidenceRangeLabel}</StatePill></div>
    <div className="confidence-band-value"><strong>{data.currentConfidenceDisplay}</strong><span>Current confidence</span></div>
    <div className="confidence-track-wrap"><div className="confidence-track"><span className="confidence-track-range" /><span className="confidence-track-indicator" style={{ left: `${position}%` }} /></div><div className="confidence-track-labels"><span>{Math.round(data.confidenceRangeMin * 100)}%</span><span className="track-current">{data.currentConfidenceDisplay}<i /></span><span>{Math.round(data.confidenceRangeMax * 100)}%</span></div></div>
    <p className="confidence-band-note">Confidence changes only after an approved simulation produces a measured outcome.</p>
  </section>;
}

export function LearningScreen({ data, decisionState = "review" }: { data: LearningViewModel; decisionState?: DecisionState }) {
  return <div className="page-stack learning-page" data-workflow-stage={data.records.length ? "LEARNED" : "PENDING"}>
    <section className="route-intro learning-intro">
      <div><Eyebrow tone="glacier">Observe / measure / learn</Eyebrow><h1>Trust is <em>measured.</em></h1><p>Prediction earns confidence only after the outcome is observed.</p></div>
      <div className="learning-current-chip"><span className="learning-chip-mark"><Icon name="spark" /></span><div><span>MODEL CONFIDENCE</span><strong>{data.currentConfidenceDisplay}</strong></div></div>
    </section>

    {decisionState !== "review" && <section className={`learning-preview-state learning-preview-${decisionState}`} aria-live="polite">
      <span className="learning-preview-mark"><Icon name={decisionState === "approved" ? "check" : "warning"} /></span>
      <div><Eyebrow>{decisionState === "approved" ? "PREVIEW / APPROVAL" : "PREVIEW / REJECTION"}</Eyebrow><strong>{decisionState === "approved" ? "Approval shown locally; no simulation was run." : "Rejection shown locally; no Learning record was created."}</strong><span>Actual outcome is not recorded. Model confidence remains {data.currentConfidenceDisplay}.</span></div>
    </section>}

    <section className="learning-process" aria-labelledby="learning-process-title">
      <div className="learning-process-head"><div><Eyebrow>THE CLOSED LOOP</Eyebrow><h2 id="learning-process-title">From forecast to evidence.</h2></div><span className="process-note">Confidence changes after observed error</span></div>
      <ol className="learning-steps">{data.flowSteps.map((step, index) => <li className={`learning-step${index === 0 ? " learning-step-current" : ""}`} key={step}>
        <span className="learning-step-node">{index === 0 ? <Icon name="spark" /> : String(index + 1).padStart(2, "0")}</span><span className="learning-step-title">{step}</span>{index < data.flowSteps.length - 1 && <span className="learning-step-connector" aria-hidden="true" />}
      </li>)}</ol>
    </section>

    <section className="learning-measure-layout">
      <ConfidenceBand data={data} />
      <article className="measurement-card">
        <div className="measurement-head"><div><Eyebrow>MEASURE / PREDICTED VS ACTUAL</Eyebrow><h2>Outcome comparison</h2></div><StatePill tone={data.records.length ? "positive" : "neutral"}>{data.records.length ? "Observed" : "Awaiting observation"}</StatePill></div>
        {data.records.length ? <div className="measurement-records">{data.records.map((record) => <div className="measurement-record" key={record.id}>
          <div className="measurement-period">{record.periodDisplay}</div>
          <div className="measurement-values"><div><span>Predicted · 3 days</span><strong>{record.predictedContributionProfitDisplay}</strong></div><span className="measurement-arrow">→</span><div><span>Actual Simulated · 3 days</span><strong>{record.actualContributionProfitDisplay}</strong></div></div>
          <div className="measurement-error"><span>Prediction error</span><strong>{record.errorDisplay}</strong><span>Accuracy</span><strong>{record.accuracyDisplay}</strong></div>
          <div className="measurement-confidence"><span>Confidence</span><strong>{record.confidenceBeforeDisplay} <i>→</i> {record.confidenceAfterDisplay}</strong></div>
        </div>)}</div> : <div className="measurement-empty">
          <div className="forecast-compare"><div className="forecast-cell"><span>Current 3-day projection</span><strong>{data.pendingPredictionDisplay ?? "—"}</strong><small>{data.pendingPeriodDisplay ?? "Predicted contribution-profit impact"}</small></div><span className="forecast-arrow">→</span><div className="forecast-cell forecast-actual"><span>Actual Simulated contribution profit</span><strong>Not recorded</strong><small>Awaiting observed outcome</small></div></div>
          <p>No simulation completed yet. Approve and simulate a recommendation to measure forecast error and update confidence.</p>
        </div>}
      </article>
    </section>

    <ConfidenceHistory data={data} />

    <section className="learning-formula-grid">
      <article className="formula-card"><div className="formula-head"><span className="formula-mark">M5</span><div><Eyebrow>EXISTING MODEL RULE</Eyebrow><h2>Confidence update</h2></div></div><div className="formula-lines"><code>{data.formulaAccuracy}</code><code>{data.formulaConfidence}</code></div><div className="formula-footer"><span>{data.stepCapDisplay}</span><span>Range {data.confidenceRangeLabel}</span></div></article>
      <article className="learning-truth-card"><span className="truth-index">LEARNING / 01</span><div className="truth-mark"><Icon name="clock" /></div><h2>No outcome,<br /><em>no confidence change.</em></h2><p>The existing M5 loop consumes measured error after simulation. The interface does not estimate or backfill missing actuals.</p></article>
    </section>
  </div>;
}
