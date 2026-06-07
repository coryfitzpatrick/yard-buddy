"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";

interface Props {
  data: { date: string; score: number }[];
}

export function SectionHealthChart({ data }: Props) {
  const points = data.map((d) => ({
    date: format(new Date(d.date), "MMM d"),
    score: d.score,
  }));

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(val) => [`${val ?? ""}`, "Health"]}
          contentStyle={{ fontSize: 12 }}
          labelStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#16a34a"
          strokeWidth={2}
          dot={{ fill: "#16a34a", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
