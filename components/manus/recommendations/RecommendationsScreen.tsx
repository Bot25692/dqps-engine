"use client";

import { useEffect, useRef } from 'react';
import type { DecisionHandlers, RecommendationViewModel } from "@/lib/presentation/manus-contracts";
import { Icon } from "@/components/manus/ui/Icons";
import { Eyebrow, StatePill } from "@/components/manus/ui/Primitives";
import { AllocationCanvas } from "@/components/manus/recommendations/AllocationCanvas";

function WorkflowRibbon({ stages }: { stages: RecommendationViewModel["workflowStages"] }) {
  return <ol className="workflow-ribbon" aria-label="A.D.A.P.T. decision workflow">{stages.map((stage, index) => <li key={stage.id} className={`workflow-step workflow-${stage.state}`} aria-current={stage.state === "active" ? "step" : undefined}>
    <span className="workflow-node">{stage.state === "complete" ? <Icon name="check" /> : String(index + 1).padStart(2, "0")}</span><span className="workflow-label">{stage.label}</span>{index < stages.length - 1 && <span className="workflow-connector" aria-hidden="true" />}
  </li>)}</ol>;
}

function ResultState({ data, handlers }: { data: RecommendationViewModel; handlers: DecisionHandlers }) {
  if (handlers.state !== "simulated" && handlers.state !== "rejected") return null;
  const isPreview = handlers.isPreview ?? false;
  const approved = handlers.state === "simulated";
  return <section className={`decision-result${approved ? " result-approved" : " result-rejected"}`} aria-live="polite" aria-labelledby="decision-result-title">
    <div className="result-stamp"><span className="result-stamp-icon"><Icon name={approved ? "check" : "warning"} /></span><div><Eyebrow tone={approved ? "copper" : "default"}>{isPreview ? "Local preview state" : "Decision state"}</Eyebrow><h3 id="decision-result-title">{approved ? (isPreview ? "Approval shown · engine not called" : handlers.state === "simulated" ? "Simulated outcome recorded" : "Approval recorded") : (isPreview ? "Rejected in preview · no changes made" : "Recommendation rejected")}</h3></div></div>
    {approved && <div className="result-observation-grid">
      <div><span>Existing projection · {data.asOfDisplay}</span><strong>{data.projectedThreeDayContributionProfitDisplay}</strong><small>3-day projected contribution-profit impact</small></div>
      <div><span>Actual Simulated contribution-profit outcome</span><strong className={handlers.actualDisplay ? "" : "pending-value"}>{handlers.actualDisplay ?? "Not recorded"}</strong><small>Three-day simulated incremental contribution profit</small></div>
      <div><span>Confidence after measurement</span><strong className={handlers.confidenceAfterDisplay ? "" : "pending-value"}>{handlers.confidenceAfterDisplay ?? "Pending"}</strong><small>Existing model updates only after measured error</small></div>
      <div><span>Prediction error</span><strong>{handlers.errorDisplay ?? 'Unavailable'}</strong><small>Actual versus expected over three Simulated days</small></div>
    </div>}
    {handlers.state === "simulated" && <a href="/learning" className="action-primary">Inspect Learning Loop <Icon name="arrow"/></a>}
    <p className="result-boundary">{handlers.statusMessage ?? (isPreview ? "This isolated preview only changes its local display state. It does not approve a live campaign, execute ads, run a simulation, persist Learning, or update confidence." : "Workflow status is owned by the existing application.")}</p>
  </section>;
}

export function RecommendationsScreen({ data, handlers }: { data: RecommendationViewModel; handlers: DecisionHandlers }) {
  const simulationPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (handlers.state === 'approved') simulationPanel.current?.focus();
  }, [handlers.state]);
  const onApprove = handlers.onApprove;
  const onReject = handlers.onReject;
  return <div className="page-stack recommendations-page" data-workflow-stage={handlers.workflowStage}>
    {handlers.state === 'approved' && <section ref={simulationPanel} tabIndex={-1} className="decision-result result-approved simulation-panel" aria-labelledby="simulation-title" aria-busy={handlers.isBusy}>
      <Eyebrow tone="copper">APPROVED / SIMULATED EXECUTION ONLY</Eyebrow>
      <h2 id="simulation-title">3-Day Simulation</h2>
      <p>Your approval is recorded. Run the real simulation engine to measure this plan over three simulated days. Approval alone does not execute it.</p>
      <button className="action-primary" onClick={handlers.onSimulate} disabled={handlers.isBusy || !handlers.onSimulate}>{handlers.workflowStage === 'SIMULATING' ? 'Running 3-Day Simulation…' : 'Run 3-Day Simulation'} <Icon name="arrow"/></button>
      {handlers.workflowStage === 'SIMULATING' && <div role="status"><p>Running the three-day scenario, measuring contribution profit and saving the outcome. Please wait; duplicate execution is blocked.</p><progress aria-label="Simulation in progress" /></div>}
    </section>}
    <section className="recommendation-masthead">
      <div className="recommendation-title-block"><Eyebrow tone="copper">Decision review <span className="eyebrow-separator">/</span> {data.asOfDisplay}</Eyebrow><h1>Protect the<br /><em>profit opportunity.</em></h1><p>The highest return is not always the safest place to keep spending.</p></div>
      <aside className="impact-monument" aria-label="Expected contribution profit impact">
        <span className="impact-orbit orbit-a" /><span className="impact-orbit orbit-b" /><div className="impact-monument-content">
          <span className="impact-label"><i />ENGINE-CALCULATED · EXPECTED</span><strong>{data.expectedDailyContributionProfitDisplay}</strong><span className="impact-unit">contribution profit <i>·</i> / day</span>
          <div className="impact-divider" /><div className="impact-projection"><span>3-day projection</span><strong>{data.projectedThreeDayContributionProfitDisplay}</strong></div>
        </div>
      </aside>
    </section>

    <WorkflowRibbon stages={data.workflowStages} />

    <section className="diagnosis-bar" aria-label="Selected campaign diagnosis facts">
      <div className="diagnosis-primary"><StatePill tone="risk">{data.diagnosisLabel}</StatePill><span className="diagnosis-campaign">{data.campaignName} <i>·</i> {data.platform} <i>·</i> {data.sku}</span></div>
      <div className="diagnosis-facts"><div><span>Current cover</span><strong>{data.currentRunwayDisplay}</strong></div><div><span>Cover at detection</span><strong>{data.runwayDisplay}</strong></div><span className="threshold-rule" aria-hidden="true" /><div><span>Warning threshold</span><strong>{data.warningThresholdDisplay}</strong></div><div><span>Z-score</span><strong>{data.zScoreDisplay}</strong></div><div className="diagnosis-date"><span>Detected</span><strong>{data.detectedAtDisplay}</strong></div></div>
    </section>

    <section className="decision-grid">
      <div className="decision-left-stack">
        <article className="evidence-canvas" aria-labelledby="evidence-title">
          <div className="evidence-canvas-top"><span className="section-index">01</span><div><Eyebrow>WHY / EVIDENCE</Eyebrow><h2 id="evidence-title">Inventory sets the ceiling.</h2></div></div>
          <p className="evidence-quote">“{data.evidence}”</p>
          <div className="evidence-context"><span className="evidence-glyph"><Icon name="cube" /></span><div><strong>High ROAS ≠ automatically scale.</strong><span>Healthy return cannot replenish constrained inventory.</span></div><span className="evidence-context-dot" /></div>
        </article>
        <AllocationCanvas donor={data.donor} donors={data.donors} receivers={data.receivers} />
      </div>

      <aside className="decision-side-rail">
        <section className="decision-summary-card">
          <div className="summary-card-head"><span className="section-index">02</span><div><Eyebrow>DECIDE / SUMMARY</Eyebrow><h2>Allocation, rebalanced.</h2></div></div>
          <div className="summary-pair"><span>Budgets adjusted</span><strong>{data.adjustedBudgetsDisplay}</strong></div>
          <div className="summary-pair"><span>Held back</span><strong>{data.heldBackDisplay}</strong></div>
          <div className="summary-pair"><span>Expected daily lift</span><strong className="summary-positive">{data.expectedDailyContributionProfitDisplay}</strong></div>
          <span className="summary-caption">Contribution-profit gain · source calculation</span>
        </section>

        <section className="guardrail-card">
          <div className="summary-card-head"><span className="section-index">03</span><div><Eyebrow>DECISION / GUARDRAILS</Eyebrow><h2>Within guardrails.</h2></div></div>
          <div className="guardrail-list">{data.guardrails.map((guardrail) => <div key={guardrail.id} className={`guardrail-item guardrail-${guardrail.state}`}><span className="guardrail-check"><Icon name={guardrail.state === "satisfied" ? "check" : "warning"} /></span><span>{guardrail.label}</span><strong>{guardrail.state === "satisfied" ? "Satisfied" : guardrail.state}</strong></div>)}</div>
        </section>

        <section className="confidence-card">
          <div className="confidence-card-head"><div><Eyebrow>MODEL / CONFIDENCE</Eyebrow><h2>Decision confidence</h2></div><span className="confidence-band">{data.confidenceBand}</span></div>
          <div className="confidence-number"><strong>{data.confidenceDisplay}</strong><span>Current model confidence</span></div>
          <div className="confidence-range-line"><span>{data.confidenceRangeDisplay}</span><span>Step cap {data.confidenceStepCapDisplay}</span></div>
          <div className="confidence-scale" aria-hidden="true"><span className="confidence-scale-fill" style={{ width: `${data.confidenceTrackPositionPercent}%` }} /><i style={{ left: `${data.confidenceTrackPositionPercent}%` }} /></div>
          <p>Confidence updates only after the measured simulation outcome is observed.</p>
        </section>

        <section className="approval-card" aria-labelledby="approval-title">
          <div className="approval-card-top"><span className="approval-icon"><Icon name="spark" /></span><div><Eyebrow tone="copper">HUMAN APPROVAL REQUIRED</Eyebrow><h2 id="approval-title">Your decision.</h2></div></div>
          <StatePill tone={handlers.state === "review" ? "warning" : handlers.state === "approved" || handlers.state === "simulated" ? "positive" : "neutral"}>{handlers.state === "review" ? "Awaiting approval" : handlers.state === "approved" ? (handlers.isPreview ? "Preview approval" : "Approved") : handlers.state === "simulated" ? "Simulated" : "Rejected"}</StatePill>
          <div className="approval-actions">
            {handlers.state === "approved" ? (
              <button
                type="button"
                className="action-primary"
                onClick={handlers.onSimulate}
                disabled={handlers.isBusy || !handlers.onSimulate}
                aria-describedby="approval-boundary"
              >
                {handlers.workflowStage === "SIMULATING" ? "Running 3-Day Simulation…" : "Run 3-Day Simulation"} <Icon name="arrow" />
              </button>
            ) : handlers.state === "simulated" ? (
              <a href="/learning" className="action-primary" aria-describedby="approval-boundary">
                Inspect Learning Loop <Icon name="arrow" />
              </a>
            ) : (
              <>
                <button
                  type="button"
                  className="action-primary"
                  onClick={onApprove}
                  disabled={handlers.isBusy || handlers.state !== 'review'}
                  aria-describedby="approval-boundary"
                >
                  {handlers.isBusy ? "Working…" : "Approve & Proceed"} <Icon name="arrow" />
                </button>
                <button
                  type="button"
                  className="action-secondary"
                  onClick={onReject}
                  disabled={handlers.isBusy || handlers.state !== "review"}
                >
                  Reject
                </button>
              </>
            )}
          </div>
          <p id="approval-boundary">
            {handlers.state === "approved"
              ? "Plan approved. Run the three-day simulation to measure outcome and calibrate confidence."
              : handlers.state === "simulated"
              ? "Three-day simulation complete. Inspect the Learning page to view outcome and error calibration."
              : "Approve this plan, then run the three-day simulation. No live ad execution."}
          </p>
        </section>
      </aside>
    </section>
    <ResultState data={data} handlers={handlers} />
  </div>;
}
