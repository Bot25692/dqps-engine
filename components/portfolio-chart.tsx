"use client";

/* ─── PortfolioChart ─────────────────────────────────────────────────────────
   Dark-themed Recharts area+line chart of portfolio revenue, spend, profit.
   Matches Manus color palette and typography.
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
interface TooltipEntry {
  name: string;
  value: number;
  color: string;
}
interface DarkTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}
const DarkTooltip = ({ active, payload, label }: DarkTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: "rgba(17, 23, 31, 0.96)",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 11,
        color: "#f0f2f4",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        backdropFilter: "blur(8px)",
      }}
    >
      <p
        style={{
          marginBottom: 6,
          fontWeight: 600,
          color: "#94a3b8",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 10,
        }}
      >
        {label}
      </p>
      {payload.map((entry) => (
        <div
          key={entry.name}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 3,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              backgroundColor: entry.color,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#94a3b8", fontSize: 10 }}>{entry.name}:</span>
          <span
            style={{
              fontWeight: 600,
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 11,
              color: "#ffffff",
            }}
          >
            {formatTooltipValue(entry.value, entry.name)[0]}
          </span>
        </div>
      ))}
    </div>
  );
};

export function PortfolioChart({ data }: PortfolioChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 16, left: 4, bottom: 0 }}
      >
        <defs>
          <linearGradient id="revenueFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef8757" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#ef8757" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="profitFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#45c497" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#45c497" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Subtle grid lines */}
        <CartesianGrid
          strokeDasharray="2 4"
          stroke="rgba(148, 163, 184, 0.08)"
          vertical={false}
        />

        <XAxis
          dataKey="day"
          tick={{ fontSize: 9, fill: "#65717e", fontFamily: "var(--font-mono, monospace)" }}
          tickLine={false}
          axisLine={false}
          interval={4}
        />

        <YAxis
          tick={{ fontSize: 9, fill: "#65717e", fontFamily: "var(--font-mono, monospace)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatYAxis}
          width={48}
        />

        <Tooltip content={<DarkTooltip />} />

        {/* Revenue: soft orange area + line */}
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          fill="url(#revenueFillGrad)"
          stroke="#ef8757"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#ef8757" }}
        />

        {/* Contribution Profit: bright teal-green line */}
        <Area
          type="monotone"
          dataKey="profit"
          name="Contribution Profit"
          fill="url(#profitFillGrad)"
          stroke="#45c497"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#45c497" }}
        />

        {/* Ad Spend: dashed cyan line */}
        <Line
          type="monotone"
          dataKey="spend"
          name="Ad Spend"
          stroke="#76bacb"
          strokeWidth={1.6}
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 3, fill: "#76bacb" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
