"use client";

/* ─── PortfolioChart component ────────────────────────────────────────────── */
/* Renders a 30-day area+line chart of portfolio revenue, spend, and profit.   */
/* Must be "use client" — Recharts uses browser APIs (ResizeObserver, SVG).   */
/* Receives pre-computed data as a prop — no business logic inside here.       */
/* The page (Server Component) imports fixture data and passes it down.        */

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

/* Format INR values on the Y-axis: ₹3,52,800 → "₹3.5L" for compact display */
function formatYAxis(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value}`;
}

/* Format tooltip value with full INR formatting */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTooltipValue(value: any, name: any): [string, string] {
  const num = typeof value === "number" ? value : Number(value);
  const formatted =
    typeof num === "number" && !isNaN(num)
      ? `₹${num.toLocaleString("en-IN")}`
      : String(value ?? "");
  return [formatted, String(name ?? "")];
}

export function PortfolioChart({ data }: PortfolioChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart
        data={data}
        margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

        {/* X-axis: show every 5th day label to avoid crowding */}
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          interval={4}
        />

        {/* Y-axis: compact INR format */}
        <YAxis
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatYAxis}
          width={52}
        />

        <Tooltip
          formatter={formatTooltipValue}
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
          labelStyle={{ fontWeight: 600, marginBottom: 4 }}
        />

        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />

        {/* Revenue: filled area — primary metric */}
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          fill="#dbeafe"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />

        {/* Contribution Profit: line — the objective metric */}
        <Line
          type="monotone"
          dataKey="profit"
          name="Contribution Profit"
          stroke="#16a34a"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />

        {/* Spend: dashed line — context for efficiency reading */}
        <Line
          type="monotone"
          dataKey="spend"
          name="Ad Spend"
          stroke="#d97706"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
          activeDot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
