"use client";

/* ─── PortfolioChart ─────────────────────────────────────────────────────────
   Dark-themed Recharts area+line chart of portfolio revenue, spend, profit.
   "use client" — Recharts uses browser APIs (ResizeObserver, SVG).
   Receives pre-computed data as a prop — no business logic inside.
   ─────────────────────────────────────────────────────────────────────────── */

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { DailyPortfolioRow } from "@/lib/demo/g1-fixtures";

interface PortfolioChartProps {
  data: DailyPortfolioRow[];
}

/* Compact INR Y-axis labels */
function formatYAxis(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTooltipValue(value: any, name: any): [string, string] {
  const num = typeof value === "number" ? value : Number(value);
  const formatted =
    typeof num === "number" && !isNaN(num)
      ? `₹${num.toLocaleString("en-IN")}`
      : String(value ?? "");
  return [formatted, String(name ?? "")];
}

/* Custom dark tooltip */
interface TooltipEntry { name: string; value: number; color: string }
interface DarkTooltipProps { active?: boolean; payload?: TooltipEntry[]; label?: string | number }
const DarkTooltip = ({ active, payload, label }: DarkTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        padding: "10px 12px",
        fontSize: 12,
        color: "var(--text-primary)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <p style={{ marginBottom: 6, fontWeight: 600, color: "var(--text-secondary)" }}>
        Day {label}
      </p>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: entry.color, display: "inline-block", flexShrink: 0 }} />
          <span style={{ color: "var(--text-secondary)" }}>{entry.name}:</span>
          <span style={{ fontWeight: 600, fontFamily: "monospace" }}>
            {formatTooltipValue(entry.value, entry.name)[0]}
          </span>
        </div>
      ))}
    </div>
  );
};

export function PortfolioChart({ data }: PortfolioChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        {/* Dark grid */}
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />

        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
          tickLine={false}
          axisLine={false}
          interval={4}
        />

        <YAxis
          tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatYAxis}
          width={52}
        />

        <Tooltip content={<DarkTooltip />} />

        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 10, color: "var(--text-secondary)" }}
          iconType="circle"
          iconSize={8}
        />

        {/* Revenue: soft orange area */}
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          fill="rgba(249,115,22,0.08)"
          stroke="#f97316"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#f97316" }}
        />

        {/* Contribution Profit: bright green line — the key metric */}
        <Line
          type="monotone"
          dataKey="profit"
          name="Contribution Profit"
          stroke="#22c55e"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: "#22c55e" }}
        />

        {/* Ad Spend: dashed amber line */}
        <Line
          type="monotone"
          dataKey="spend"
          name="Ad Spend"
          stroke="#f59e0b"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 3, fill: "#f59e0b" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
