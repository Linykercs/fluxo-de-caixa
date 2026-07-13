import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useIsAdmin } from "../api/auth";
import { useBudgetReport } from "../api/budgets";
import type { BudgetReportRow, CategoryKind } from "../api/types";
import { BudgetModal } from "../components/budgets/BudgetModal";
import { addMonths, currentMonth, formatMonthLong } from "../lib/dates";
import { formatBRL } from "../lib/money";

const KIND_LABEL: Record<CategoryKind, string> = { EXPENSE: "Despesas", INCOME: "Receitas" };

function ProgressBar({ row }: { row: BudgetReportRow }) {
  if (row.budgetedCents === 0) return <span className="hint">—</span>;
  const pct = Math.round((row.actualCents / row.budgetedCents) * 100);
  const over = row.actualCents > row.budgetedCents;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
      <div style={{ flex: 1, height: 8, background: "var(--neutral-bg)", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.min(pct, 100)}%`,
            height: "100%",
            background: over ? "var(--red)" : "var(--green)",
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: over ? "var(--red)" : "var(--ink-soft)", minWidth: 40, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function BudgetSection({ kind, rows, onEdit }: { kind: CategoryKind; rows: BudgetReportRow[]; onEdit: (row: BudgetReportRow) => void }) {
  const isAdmin = useIsAdmin();
  if (rows.length === 0) return null;

  return (
    <div className="card">
      <div className="card-header">
        <span>{KIND_LABEL[kind]}</span>
      </div>
      <table className="stack-mobile">
        <thead>
          <tr>
            <th>Categoria</th>
            <th className="r">Orçado</th>
            <th className="r">Realizado</th>
            <th style={{ width: 160 }}>Progresso</th>
            {isAdmin && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.categoryId}>
              <td>{row.categoryName}</td>
              <td className="r money" data-label="Orçado">{row.budgetedCents > 0 ? formatBRL(row.budgetedCents) : "—"}</td>
              <td className="r money" data-label="Realizado">{formatBRL(row.actualCents)}</td>
              <td data-label="Progresso">
                <ProgressBar row={row} />
              </td>
              {isAdmin && (
                <td className="r">
                  <button type="button" className="btn-link" onClick={() => onEdit(row)}>
                    {row.budgetId ? "Editar" : "Definir"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BudgetsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get("month") ?? currentMonth();
  const { data: report, isLoading, isError } = useBudgetReport(month);
  const [editing, setEditing] = useState<BudgetReportRow | null>(null);

  function goToMonth(target: string) {
    setSearchParams({ month: target });
  }

  const expenses = report?.filter((row) => row.kind === "EXPENSE") ?? [];
  const incomes = report?.filter((row) => row.kind === "INCOME") ?? [];

  return (
    <>
      <div className="page-head">
        <h2>Orçamentos</h2>
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

      {isLoading && <p className="page-state">Carregando orçamentos…</p>}
      {isError && (
        <p className="page-state">Não foi possível carregar os orçamentos. Verifique a conexão e recarregue a página.</p>
      )}

      {report && (
        <div className="cards-grid cols-1">
          <BudgetSection kind="EXPENSE" rows={expenses} onEdit={setEditing} />
          <BudgetSection kind="INCOME" rows={incomes} onEdit={setEditing} />
        </div>
      )}

      {editing && <BudgetModal row={editing} month={month} onClose={() => setEditing(null)} />}
    </>
  );
}
