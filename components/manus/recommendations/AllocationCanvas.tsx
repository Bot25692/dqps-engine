"use client";

import { useState } from "react";
import type { BudgetMoveViewModel } from "@/lib/presentation/manus-contracts";
import { Icon } from "@/components/manus/ui/Icons";

export function AllocationCanvas({ donor, donors = [donor], receivers }: { donor: BudgetMoveViewModel; donors?: BudgetMoveViewModel[]; receivers: BudgetMoveViewModel[] }) {
  const [activeReceiver, setActiveReceiver] = useState<string | null>(null);
  return <section className="allocation-canvas" aria-labelledby="allocation-title">
    <div className="allocation-canvas-head"><div><span className="surface-kicker"><i />DECISION / BUDGET MOVEMENT</span><h2 id="allocation-title">Budget released.<br /><em>{receivers.length} eligible {receivers.length === 1 ? "destination" : "destinations"}.</em></h2></div><span className="flow-stamp">CURRENT <b>→</b> PROPOSED</span></div>
    {donors.map(donor => <div key={donor.id} className={`donor-source${activeReceiver ? " source-connected" : ""}`}>
      <div className="source-mark-wrap"><span className="source-mark"><Icon name="arrowUp" /></span><span className="source-port" /></div>
      <div className="source-identity"><span className="source-kicker">BUDGET SOURCE · {donor.platform}</span><strong>{donor.name}</strong><span>{donor.campaignId} <i>·</i> {donor.sku}</span></div>
      <div className="source-values"><div><span>Current</span><strong>{donor.currentBudgetDisplay}</strong></div><span className="move-arrow">→</span><div><span>Proposed</span><strong>{donor.proposedBudgetDisplay}</strong></div></div>
      <div className="source-change"><span>Released daily</span><strong>{donor.changeDisplay}</strong></div>
    </div>)}
    <div className="allocation-link-caption"><span className="connector-glyph">└</span><span>Reallocation paths · focus a receiver to trace the move</span></div>
    <div className="receiver-list" role="list" aria-label="Recommended receiver budget allocations">
      {receivers.map((receiver, index) => <article
        key={receiver.id}
        className={`receiver-row${activeReceiver === receiver.id ? " receiver-active" : ""}`}
        role="listitem"
        tabIndex={0}
        onMouseEnter={() => setActiveReceiver(receiver.id)}
        onMouseLeave={() => setActiveReceiver(null)}
        onFocus={() => setActiveReceiver(receiver.id)}
        onBlur={() => setActiveReceiver(null)}
      >
        <div className="receiver-path" aria-hidden="true"><span className="path-track" /><span className="path-node">{String(index + 1).padStart(2, "0")}</span></div>
        <div className="receiver-identity"><span className="receiver-kicker">RECEIVER · {receiver.platform}</span><strong>{receiver.name}</strong><span>{receiver.campaignId} <i>·</i> {receiver.sku}{receiver.marginDisplay && <> <i>·</i> Margin {receiver.marginDisplay}</>}</span></div>
        <div className="receiver-values"><span>{receiver.currentBudgetDisplay}</span><Icon name="arrow" /><strong>{receiver.proposedBudgetDisplay}</strong></div>
        <div className="receiver-change">{receiver.changeDisplay}</div>
      </article>)}
    </div>
    <div className="allocation-footnote"><span className="footnote-line" />Proposed daily budgets · source-provided · no campaign execution</div>
  </section>;
}
