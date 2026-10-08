import type { PortfolioChartViewModel, ChartSeries } from "@/lib/presentation/manus-contracts";

const view = { width: 920, height: 286, left: 78, right: 900, top: 20, bottom: 222 };
const toneClass: Record<ChartSeries["tone"], string> = {
  copper: "trace-copper",
  glacier: "trace-glacier",
  profit: "trace-profit",
  neutral: "trace-neutral",
  caution: "trace-caution",
  critical: "trace-critical",
};

function xForLabel(label: string, labels: string[]) {
  const index = labels.indexOf(label);
  return index < 0 ? null : view.left + (labels.length <= 1 ? 0 : (index / (labels.length - 1)) * (view.right - view.left));
}

function yForValue(value: number, min: number, max: number) {
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  return view.bottom - ratio * (view.bottom - view.top);
}

function seriesPath(series: ChartSeries, labels: string[], min: number, max: number) {
  return series.points.map((point) => {
    const x = xForLabel(point.xLabel, labels);
    return x === null ? null : { x, y: yForValue(point.value, min, max), point };
  }).filter((point): point is NonNullable<typeof point> => point !== null)
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

export function ProfitabilityChart({ chart }: { chart: PortfolioChartViewModel }) {
  const hasPoints = chart.series.some((series) => series.points.length > 0);
  return <section className="chart-surface" aria-labelledby="portfolio-chart-title">
    <div className="chart-header">
      <div><div className="chart-kicker"><span className="chart-kicker-mark" />DATA / PORTFOLIO</div><h2 id="portfolio-chart-title">{chart.title}</h2><p>{chart.subtitle}</p></div>
      <span className="chart-period">{chart.periodLabel}</span>
    </div>
    <div className={`chart-stage${hasPoints ? " has-series" : " is-empty"}`}>
      <svg className="portfolio-chart" viewBox={`0 0 ${view.width} ${view.height}`} role="img" aria-labelledby="chart-svg-title chart-svg-desc" preserveAspectRatio="none">
        <title id="chart-svg-title">{chart.title}</title>
        <desc id="chart-svg-desc">{chart.subtitle}. Dates and value-axis labels come from the selected dataset.</desc>
        <g className="chart-grid">
          {chart.yTicks.map((tick) => <g key={`${tick.value}-${tick.label}`}>
            <line x1={view.left} x2={view.right} y1={yForValue(tick.value, chart.minValue, chart.maxValue)} y2={yForValue(tick.value, chart.minValue, chart.maxValue)} />
            <text x={view.left - 14} y={yForValue(tick.value, chart.minValue, chart.maxValue) + 4} textAnchor="end">{tick.label}</text>
          </g>)}
          {chart.xLabels.map((label) => {
            const x = xForLabel(label, chart.xLabels) ?? view.left;
            return <line className="chart-vgrid" key={label} x1={x} x2={x} y1={view.top} y2={view.bottom} />;
          })}
        </g>
        {chart.series.map((series) => <g key={series.id} className={`chart-series ${toneClass[series.tone]}`}>
          <path d={seriesPath(series, chart.xLabels, chart.minValue, chart.maxValue)} className="chart-trace" />
          {series.points.map((point, index) => {
            const x = xForLabel(point.xLabel, chart.xLabels);
            if (x === null) return null;
            const y = yForValue(point.value, chart.minValue, chart.maxValue);
            return <circle className="chart-point" key={`${series.id}-${point.xLabel}-${index}`} cx={x} cy={y} r="4"><title>{`${series.label} · ${point.xLabel}: ${point.displayValue}`}</title></circle>;
          })}
        </g>)}
        <g className="chart-x-labels">{chart.xLabels.map((label, index) => {
          if (index % Math.max(1, Math.ceil((chart.xLabels.length - 1) / 4)) !== 0 && index !== chart.xLabels.length - 1) return null;
          const x = xForLabel(label, chart.xLabels) ?? view.left;
          return <text key={label} x={x} y={view.height - 14} textAnchor={index === 0 ? "start" : index === chart.xLabels.length - 1 ? "end" : "middle"}>{label}</text>;
        })}</g>
      </svg>
      {!hasPoints && <div className="chart-empty" role="status"><span className="chart-empty-glyph"><span /><span /><span /></span><strong>Series are supplied by the selected dataset</strong><p>{chart.emptyMessage ?? "No chart points are available in this view."}</p></div>}
    </div>
    <div className="chart-footer"><div className="chart-legend">{chart.series.map((series) => <span className="legend-item" key={series.id}><i className={`legend-swatch ${toneClass[series.tone]}`} />{series.label}</span>)}</div><span className="chart-footnote">Revenue × SKU margin − ad spend</span></div>
  </section>;
}
