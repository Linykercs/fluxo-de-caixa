import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartMonth } from "../api/types";
import { formatMonthShort } from "../lib/dates";
import { formatBRL } from "../lib/money";

interface Props {
  data: ChartMonth[];
}

function formatK(value: number): string {
  if (Math.abs(value) >= 1000) return `R$${(value / 100000).toFixed(0)}k`;
  return formatBRL(value * 100);
}

export function CashFlowChart({ data }: Props) {
  const chartData = data.map((d) => ({
    month: formatMonthShort(d.month),
    receitas: d.receitasCents / 100,
    despesas: d.despesasCents / 100,
    resultado: d.resultadoCents / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatK} tick={{ fontSize: 11 }} width={56} />
        <Tooltip
          formatter={(value, name) => [
            typeof value === "number" ? formatBRL(value * 100) : String(value),
            name === "receitas" ? "Receitas" : name === "despesas" ? "Despesas" : "Resultado líquido",
          ]}
          labelStyle={{ fontWeight: 600 }}
        />
        <Legend
          formatter={(value) =>
            value === "receitas" ? "Receitas" : value === "despesas" ? "Despesas" : "Resultado líquido"
          }
        />
        <Bar dataKey="receitas" fill="var(--green)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="despesas" fill="var(--red)" radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="resultado"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
