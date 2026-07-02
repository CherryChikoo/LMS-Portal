"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartWrapper } from "./chart-wrapper";
import { type ReactNode } from "react";

interface BarChartProps {
  title: string;
  description?: string;
  action?: ReactNode;
  data: Array<Record<string, unknown>>;
  dataKey: string;
  xAxisKey: string;
  color?: string;
  height?: number;
  className?: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="glass-popover rounded-xl px-3 py-2 text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold text-foreground">{payload[0].value.toLocaleString()}</p>
    </div>
  );
}

export function BarChartComponent({
  title,
  description,
  action,
  data,
  dataKey,
  xAxisKey,
  color = "#10B981",
  height = 280,
  className,
}: BarChartProps) {
  return (
    <ChartWrapper title={title} description={description} action={action} className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-border/40"
            vertical={false}
          />
          <XAxis
            dataKey={xAxisKey}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "currentColor", className: "text-muted/30" }} />
          <Bar
            dataKey={dataKey}
            fill={color}
            radius={[6, 6, 0, 0]}
            maxBarSize={40}
          />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
