"use client";

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartWrapper } from "./chart-wrapper";
import { type ReactNode } from "react";

interface PieChartProps {
  title: string;
  description?: string;
  action?: ReactNode;
  data: Array<{ name: string; value: number; fill?: string }>;
  colors?: string[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  className?: string;
}

const DEFAULT_COLORS = ["#10B981", "#059669", "#34D399", "#6EE7B7", "#047857"];

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="glass-popover rounded-xl px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: payload[0].payload.fill }}
        />
        <span className="text-muted-foreground">{payload[0].name}</span>
      </div>
      <p className="font-semibold text-foreground mt-0.5">
        {payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

function CustomLegend({
  payload,
}: {
  payload?: Array<{ value: string; color: string }>;
}) {
  if (!payload) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function PieChartComponent({
  title,
  description,
  action,
  data,
  colors = DEFAULT_COLORS,
  height = 280,
  innerRadius = 60,
  outerRadius = 100,
  className,
}: PieChartProps) {
  return (
    <ChartWrapper title={title} description={description} action={action} className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.fill || colors[index % colors.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </RechartsPieChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
