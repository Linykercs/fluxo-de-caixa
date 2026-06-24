import { useSearchParams } from "react-router-dom";
import { useDashboard } from "../api/dashboard";
import { useChartReport } from "../api/reports";
import { CashFlowChart } from "../components/CashFlowChart";
import {
  addMonths,
  currentMonth,
  formatDayMonth,
  formatMonthLong,
  formatMonthShort,
  lastDayLabel,
} from "../lib/dates";
import { formatBRL, formatBRLNumber } from "../lib/money";

const ALERT_CHIPS = {
  overdue: { className: "overdue", label: "Vencida" },
  today: { className: "today", label: "Hoje" },
  soon: { className: "open", label: "7 dias" },
} as const;

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get("month") ?? currentMonth();
  const { data, isLoading, isError } = useDashboard(month);
  const { data: chartData } = useChartReport();

  function goToMonth(target: string) {
    setSearchParams({ month: target });
  }

  if (isLoading) {
    return <p>Carregando…</p>;
  }

  if (isError || !data) {
    return <p>Não foi possível carregar o painel.</p>;
  }

  const previstoFimCents = data.projection.find((p) => p.month === month)?.balanceCents;
  const maxAbs = Math.max(1, ...data.projection.flatMap((p) => [p.payableCents, p.receivableCents]));

  const alerts = [
    ...data.alerts.overdue.map((entry) => ({ ...entry, ...ALERT_CHIPS.overdue })),
    ...data.alerts.dueToday.map((entry) => ({ ...entry, ...ALERT_CHIPS.today })),
    ...data.alerts.dueSoon.map((entry) => ({ ...entry, ...ALERT_CHIPS.soon })),
  ];

  return (
    <>
      <div className="page-head">
        <h2>Painel</h2>
        <div className="month-nav">
          <button type="button" onClick={() => goToMonth(addMonths(month, -1))} aria-label="Mês anterior">
            ◀
          </button>
          <span className="label">{formatMonthLong(month)}</span>
          <button type="button" onClick={() => goToMonth(addMonths(month, 1))} aria-label="Próximo mês">
            ▶
          </button>
        </div>
      </div>

      <div className="saldo-strip">
        <div className="cell">
          <div className="lbl">Saldo atual</div>
          <div className="val money">{formatBRL(data.totalBalanceCents)}</div>
        </div>
        <div className="cell">
          <div className="lbl">A receber no mês</div>
          <div className="val money pos">{formatBRL(data.totals.receivable.previstoCents)}</div>
        </div>
        <div className="cell">
          <div className="lbl">A pagar no mês</div>
          <div className="val money neg">{formatBRL(data.totals.payable.previstoCents)}</div>
        </div>
        <div className="cell">
          <div className="lbl">Saldo previsto ({lastDayLabel(month)})</div>
          <div className="val money">{previstoFimCents === undefined ? "—" : formatBRL(previstoFimCents)}</div>
        </div>
      </div>

      <div className="cards-grid">
        <div className="card">
          <div className="card-header">
            <span>Atenção</span>
            {data.alerts.overdue.length > 0 && (
              <span className="chip overdue">
                {data.alerts.overdue.length} vencida{data.alerts.overdue.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {alerts.length === 0 ? (
            <div className="empty">Nenhuma pendência nos próximos dias.</div>
          ) : (
            <table>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>{formatDayMonth(alert.dueDate)}</td>
                    <td>{alert.description}</td>
                    <td className={`r money ${alert.direction === "PAYABLE" ? "neg" : "pos"}`}>
                      {formatBRL(alert.remainingCents)}
                    </td>
                    <td>
                      <span className={`chip ${alert.className}`}>{alert.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span>Projeção de saldo</span>
            <span className="muted">com contas em aberto</span>
          </div>
          <div className="proj">
            {data.projection.map((p) => {
              const payablePct = Math.max(2, Math.round((p.payableCents / maxAbs) * 90));
              const receivablePct = Math.max(2, Math.round((p.receivableCents / maxAbs) * 90));
              return (
                <div className="proj-group" key={p.month}>
                  <div className="proj-month">{formatMonthShort(p.month)}</div>
                  <div className="bar-row">
                    <span className="m">Pagar</span>
                    <div className="bar n" style={{ width: `${payablePct}%` }} />
                    <span className="v money">{formatBRLNumber(p.payableCents)}</span>
                  </div>
                  <div className="bar-row">
                    <span className="m">Receber</span>
                    <div className="bar" style={{ width: `${receivablePct}%` }} />
                    <span className="v money">{formatBRLNumber(p.receivableCents)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {chartData && chartData.length > 0 && (
        <div className="cards-grid cols-1">
          <div className="card">
            <div className="card-header">
              <span>Fluxo dos últimos 6 meses</span>
              <span className="muted">realizado (caixa)</span>
            </div>
            <div style={{ padding: "16px 8px 8px" }}>
              <CashFlowChart data={chartData} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
