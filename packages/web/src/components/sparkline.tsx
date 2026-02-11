import { LineChart, Line, ResponsiveContainer } from "recharts";

export function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const first = data[0];
  const last = data[data.length - 1];
  const color = last >= first ? "#22c55e" : "#ef4444";

  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <ResponsiveContainer width={80} height={28}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
