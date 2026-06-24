import { Fragment } from "react";
import { useByCategoryReport, useByCounterpartyReport } from "../../api/reports";
import type { CounterpartySummaryRow, EntryDirection } from "../../api/types";
import { counterpartyLabel } from "../../lib/counterparty";
import { formatMonthLong } from "../../lib/dates";
import { formatBRL } from "../../lib/money";
import { Modal } from "../Modal";

interface MonthDetailModalProps {
  month: string;
  onClose: () => void;
}

export function MonthDetailModal({ month, onClose }: MonthDetailModalProps) {
  const { data: byCategory, isLoading: categoryLoading, isError: categoryError } = useByCategoryReport(month);
  const {
    data: byCounterparty,
    isLoading: counterpartyLoading,
    isError: counterpartyError,
  } = useByCounterpartyReport(month);

  return (
    <Modal title={`Detalhe de ${formatMonthLong(month)}`} onClose={onClose} width="lg">
      <div className="detail-section-title">Por categoria</div>
      {categoryLoading && <p className="hint">Carregando…</p>}
      {categoryError && <p className="hint">Não foi possível carregar o relatório.</p>}
      {byCategory && (
        <table>
          <thead>
            <tr>
              <th>Categoria</th>
              <th className="r">Previsto</th>
              <th className="r">Realizado</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.length === 0 && (
              <tr>
                <td colSpan={3} className="hint">
                  Nenhum lançamento neste mês.
                </td>
              </tr>
            )}
            {byCategory.map((row, index) => {
              const previous = byCategory[index - 1];
              const showSectionHeader = index === 0 || previous?.kind !== row.kind;
              const sign = row.kind === "EXPENSE" ? "neg" : "pos";
              return (
                <Fragment key={row.categoryId}>
                  {showSectionHeader && (
                    <tr>
                      <td colSpan={3} className="section-row">
                        {row.kind === "EXPENSE" ? "Despesas" : "Receitas"}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td>{row.categoryName}</td>
                    <td className={`r money ${sign}`}>{formatBRL(row.previstoCents)}</td>
                    <td className={`r money ${sign}`}>{formatBRL(row.realizadoCents)}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {counterpartyLoading && <p className="hint">Carregando…</p>}
      {counterpartyError && <p className="hint">Não foi possível carregar o relatório.</p>}
      {byCounterparty && (
        <>
          <CounterpartyTable
            title="Fornecedores"
            direction="PAYABLE"
            rows={byCounterparty.filter((row) => row.direction === "PAYABLE")}
          />
          <CounterpartyTable
            title="Clientes"
            direction="RECEIVABLE"
            rows={byCounterparty.filter((row) => row.direction === "RECEIVABLE")}
          />
        </>
      )}
    </Modal>
  );
}

interface CounterpartyTableProps {
  title: string;
  direction: EntryDirection;
  rows: CounterpartySummaryRow[];
}

function CounterpartyTable({ title, direction, rows }: CounterpartyTableProps) {
  const sign = direction === "PAYABLE" ? "neg" : "pos";
  return (
    <>
      <div className="detail-section-title">{title}</div>
      <table>
        <thead>
          <tr>
            <th>{counterpartyLabel(direction)}</th>
            <th className="r">Previsto</th>
            <th className="r">Realizado</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="hint">
                Nenhum {counterpartyLabel(direction).toLowerCase()} neste mês.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.counterparty}>
              <td>{row.counterparty}</td>
              <td className={`r money ${sign}`}>{formatBRL(row.previstoCents)}</td>
              <td className={`r money ${sign}`}>{formatBRL(row.realizadoCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
