"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { CampaignsViewModel } from "@/lib/presentation/manus-contracts";
import { Eyebrow } from "@/components/manus/ui/Primitives";

function platformTone(platform: string) {
  const normalized = platform.toLowerCase();
  return normalized === "meta" ? "platform-meta" : normalized === "amazon" ? "platform-amazon" : normalized === "google" ? "platform-google" : "platform-tiktok";
}

export function CampaignsScreen({ data }: { data: CampaignsViewModel }) {
  const [query,setQuery]=useState('');
  const [platform,setPlatform]=useState('all');
  const [sort,setSort]=useState('default');
  const rows=data.rows.filter(row=>(platform==='all'||row.platform===platform)&&`${row.name} ${row.sku}`.toLowerCase().includes(query.toLowerCase()));
  if(sort==='budget') rows.sort((a,b)=>b.budgetValue-a.budgetValue);
  if(sort==='name') rows.sort((a,b)=>a.name.localeCompare(b.name));
  return <div className="page-stack campaigns-page">
    <section className="route-intro route-intro-compact">
      <div><Eyebrow>Portfolio / allocation</Eyebrow><h1>Campaigns</h1><p>Compare campaign budgets, seven-day performance and inventory exposure.</p></div>
      <span className="intro-index">PORTFOLIO<br /><strong>CAMPAIGNS</strong></span>
    </section>
    <section className="campaigns-surface" aria-labelledby="campaigns-title">
      <div className="campaigns-heading"><div><span className="surface-kicker"><i />SELECTED DATASET / CAMPAIGNS</span><h2 id="campaigns-title">Current allocations</h2></div><span className="currency-label">Daily budget <i>·</i> INR</span></div>
      <div className="campaign-controls"><label>Search campaigns<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Campaign or SKU"/></label><label>Platform<select value={platform} onChange={e=>setPlatform(e.target.value)}><option value="all">All platforms</option>{[...new Set(data.rows.map(r=>r.platform))].map(p=><option key={p} value={p}>{p}</option>)}</select></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="default">Risk priority</option><option value="budget">Budget: high to low</option><option value="name">Campaign name</option></select></label><span role="status">{rows.length} of {data.rows.length} campaigns</span></div>
      <div className="campaign-table-wrap" role="region" aria-label="Campaigns and daily budgets" tabIndex={0}>
        <table className="campaign-table">
          <thead><tr><th scope="col">Campaign name</th><th scope="col">Platform</th><th scope="col">SKU</th><th scope="col">Avg spend</th><th scope="col">ROAS</th><th scope="col">Stock cover</th><th scope="col">Status</th><th scope="col" className="numeric-cell">Daily budget</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr className="campaign-row" key={row.id} style={{ "--row-index": index } as CSSProperties}>
            <td data-label="Campaign name"><span className="campaign-row-mark">{String(index + 1).padStart(2, "0")}</span><strong>{row.name}</strong></td>
            <td data-label="Platform"><span className={`platform-tag ${platformTone(row.platform)}`}><i />{row.platform}</span></td>
            <td data-label="SKU"><span className="sku-value">{row.sku}</span></td>
            <td data-label="Avg spend"><span className="table-number">{row.spendDisplay}</span></td>
            <td data-label="ROAS"><span className="table-number">{row.roasDisplay}</span></td>
            <td data-label="Stock cover"><span className="table-number">{row.runwayDisplay}</span></td>
            <td data-label="Status"><span className={`state-pill state-${row.statusTone}`}>{row.statusLabel}</span></td>
            <td data-label="Daily budget" className="numeric-cell"><strong className="budget-value">{row.dailyBudgetDisplay}</strong></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!rows.length&&<p className="host-empty" role="status">No campaigns match these filters.</p>}
      <div className="campaigns-foot"><span><i />Daily budgets · INR · No live execution</span><span>Performance: latest seven observed dates</span></div>
    </section>
  </div>;
}
