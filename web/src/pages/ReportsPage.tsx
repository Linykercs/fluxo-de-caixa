import { useRef, useState } from "react";
import { ApiError } from "../api/client";
import { useIsAdmin } from "../api/auth";
import { useCashFlowReport, useClosePeriod, useCostCenterReport, useDreReport } from "../api/reports";
import { MonthDetailModal } from "../components/reports/MonthDetailModal";
import { addMonths, currentMonth, formatMonthLong, formatMonthShort } from "../lib/dates";
import { exportDreExcel, exportDrePdf, exportObrasExcel, exportObrasPdf } from "../lib/export";
import { formatBRL } from "../lib/money";
import type { CostCenterReport, DreReport } from "../api/types";

type Tab = "categoria" | "obra";

function ExportDropdown({ onPdf, onExcel, disabled }: { onPdf: () => void; onExcel: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function handlePdf() { setOpen(false); onPdf(); }
  function handleExcel() { setOpen(false); onExcel(); }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn-secondary"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        Exportar ▾
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,.12)",
            minWidth: 130,
            zIndex: 100,
          }}
        >
          <button
            type="button"
            onClick={handlePdf}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}
          >
            PDF
          </button>
          <button
            type="button"
            onClick={handleExcel}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}
          >
            Excel
          </button>
        </div>
      )}
    </div>
  );
}

function CostCenterRow({ cc }: { cc: CostCenterReport }) {
  const [expanded, setExpanded] = useState(false);
  const resultado = cc.resultadoRealizadoCents;

  return (
    <>
      <tr className="row-clickable" onClick={() => setExpanded((v) => !v)}>
        <td style={cc.costCenterId === null ? { fontStyle: "italic", color: "var(--ink-soft)" } : undefined}>
          {cc.costCenterName} {expanded ? "▲" : "▼"}
        </td>
        <td className="r money pos">{formatBRL(cc.totalReceitasRealizadoCents)}</td>
        <td className="r money neg">{formatBRL(cc.totalDespesasRealizadoCents)}</td>
        <td className={`r money ${resultado >= 0 ? "pos" : "neg"}`}>{formatBRL(resultado)}</td>
        <td className="r money pos muted">{formatBRL(cc.totalReceitasPrevistoCents)}</td>
        <td className="r money neg muted">{formatBRL(cc.totalDespesasPrevistoCents)}</td>
        <td className={`r money muted ${cc.resultadoPrevistoCents >= 0 ? "pos" : "neg"}`}>
          {formatBRL(cc.resultadoPrevistoCents)}
        </td>
      </tr>
      {expanded && (
        <>
          {cc.receitas.length > 0 && (
            <tr>
              <td colSpan={7} className="section-row" style={{ paddingLeft: 28 }}>
                Receitas
              </td>
            </tr>
          )}
          {cc.receitas.map((row) => (
            <tr key={row.categoryId} className="detail-row">
              <td style={{ paddingLeft: 28 }}>{row.categoryName}</td>
              <td className="r money pos">{formatBRL(row.realizadoCents)}</td>
              <td />
              <td />
              <td className="r money pos muted">{formatBRL(row.previstoCents)}</td>
              <td />
              <td />
            </tr>
          ))}
          {cc.despesas.length > 0 && (
            <tr>
              <td colSpan={7} className="section-row" style={{ paddingLeft: 28 }}>
                Despesas
              </td>
            </tr>
          )}
          {cc.despesas.map((row) => (
            <tr key={row.categoryId} className="detail-row">
              <td style={{ paddingLeft: 28 }}>{row.categoryName}</td>
              <td />
              <td className="r money neg">{formatBRL(row.realizadoCents)}</td>
              <td />
              <td />
              <td className="r money neg muted">{formatBRL(row.previstoCents)}</td>
              <td />
            </tr>
          ))}
        </>
      )}
    </>
  );
}

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>("categoria");
  const [year, setYear] = useState(Number(currentMonth().slice(0, 4)));
  const [detailMonth, setDetailMonth] = useState<string | null>(null);
  const [dreMonth, setDreMonth] = useState(currentMonth());
  const [closeError, setCloseError] = useState<string | null>(null);

  const isAdmin = useIsAdmin();
  const { data: cashFlow, isLoading: cashFlowLoading, isError: cashFlowError } = useCashFlowReport(year);
  const { data: dre, isLoading: dreLoading, isError: dreError } = useDreReport(dreMonth);
  const { data: obras, isLoading: obrasLoading, isError: obrasError } = useCostCenterReport(dreMonth);
  const closePeriod = useClosePeriod();

  function handleClosePeriod() {
    if (!dre) return;
    const confirmed = window.confirm(
      `Fechar lançamentos até ${formatMonthLong(dre.month)}? Não será mais possível criar ou editar lançamentos com competência neste mês ou em meses anteriores.`,
    );
    if (!confirmed) return;
    setCloseError(null);
    closePeriod.mutate(
      { month: dre.month },
      {
        onError: (err) => setCloseError(err instanceof ApiError ? err.message : "Não foi possível fechar o mês."),
      },
    );
  }

  return (
    <>
      <div className="page-head">
        <h2>Relatórios</h2>
        <div className="tab-bar">
          <button
            type="button"
            className={tab === "categoria" ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab("categoria")}
          >
            Por Categoria
          </button>
          <button
            type="button"
            className={tab === "obra" ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab("obra")}
          >
            Por Obra
          </button>
        </div>
      </div>

      {tab === "categoria" && (
        <div className="cards-grid cols-1">
          <div className="card">
            <div className="card-header">
              <span>Fluxo de caixa mensal</span>
              <div className="month-nav">
                <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
                  ◀
                </button>
                <span className="label">{year}</span>
                <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
                  ▶
                </button>
              </div>
            </div>

            {cashFlowLoading && <div className="empty">Carregando…</div>}
            {cashFlowError && <div className="empty">Não foi possível carregar o relatório.</div>}
            {cashFlow && (
              <table>
                <thead>
                  <tr>
                    <th rowSpan={2}>Mês</th>
                    <th colSpan={2} className="group-header group-start">
                      Previsto
                    </th>
                    <th colSpan={2} className="group-header group-start">
                      Realizado
                    </th>
                  </tr>
                  <tr>
                    <th className="r group-start">A pagar</th>
                    <th className="r">A receber</th>
                    <th className="r group-start">A pagar</th>
                    <th className="r">A receber</th>
                  </tr>
                </thead>
                <tbody>
                  {cashFlow.map((row) => (
                    <tr key={row.month} className="row-clickable" onClick={() => setDetailMonth(row.month)}>
                      <td>{formatMonthShort(row.month)}</td>
                      <td className="r money neg group-start">{formatBRL(row.previsto.payableCents)}</td>
                      <td className="r money pos">{formatBRL(row.previsto.receivableCents)}</td>
                      <td className="r money neg group-start">{formatBRL(row.realizado.payableCents)}</td>
                      <td className="r money pos">{formatBRL(row.realizado.receivableCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <span>DRE</span>
              <div className="month-nav">
                <button type="button" onClick={() => setDreMonth((m) => addMonths(m, -1))} aria-label="Mês anterior">
                  ◀
                </button>
                <span className="label">{formatMonthLong(dreMonth)}</span>
                <button type="button" onClick={() => setDreMonth((m) => addMonths(m, 1))} aria-label="Próximo mês">
                  ▶
                </button>
              </div>
              <ExportDropdown
                disabled={!dre}
                onPdf={() => exportDrePdf(dre as DreReport, dreMonth)}
                onExcel={() => exportDreExcel(dre as DreReport, dreMonth)}
              />
            </div>

            {dreLoading && <div className="empty">Carregando…</div>}
            {dreError && <div className="empty">Não foi possível carregar o relatório.</div>}
            {dre && (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th className="r">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={2} className="section-row">
                        Receitas
                      </td>
                    </tr>
                    {dre.receitas.length === 0 && (
                      <tr>
                        <td colSpan={2} className="hint">
                          Nenhuma receita neste mês.
                        </td>
                      </tr>
                    )}
                    {dre.receitas.map((row) => (
                      <tr key={row.categoryId}>
                        <td>{row.categoryName}</td>
                        <td className="r money pos">{formatBRL(row.amountCents)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2} className="section-row">
                        Despesas
                      </td>
                    </tr>
                    {dre.despesas.length === 0 && (
                      <tr>
                        <td colSpan={2} className="hint">
                          Nenhuma despesa neste mês.
                        </td>
                      </tr>
                    )}
                    {dre.despesas.map((row) => (
                      <tr key={row.categoryId}>
                        <td>{row.categoryName}</td>
                        <td className="r money neg">{formatBRL(row.amountCents)}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td>Resultado do mês</td>
                      <td className={`r money ${dre.resultadoCents >= 0 ? "pos" : "neg"}`}>
                        {formatBRL(dre.resultadoCents)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="card-footer">
                  <div className="card-footer-row">
                    <span className="hint">
                      {dre.closedThroughMonth
                        ? `Lançamentos fechados até ${formatMonthLong(dre.closedThroughMonth)}.`
                        : "Nenhum mês fechado."}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={dre.isClosed || closePeriod.isPending}
                        onClick={handleClosePeriod}
                      >
                        Fechar mês
                      </button>
                    )}
                  </div>
                  {closeError && <div className="form-error">{closeError}</div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "obra" && (
        <div className="cards-grid cols-1">
          <div className="card">
            <div className="card-header">
              <span>Relatório por Obra</span>
              <div className="month-nav">
                <button type="button" onClick={() => setDreMonth((m) => addMonths(m, -1))} aria-label="Mês anterior">
                  ◀
                </button>
                <span className="label">{formatMonthLong(dreMonth)}</span>
                <button type="button" onClick={() => setDreMonth((m) => addMonths(m, 1))} aria-label="Próximo mês">
                  ▶
                </button>
              </div>
              <ExportDropdown
                disabled={!obras || obras.length === 0}
                onPdf={() => exportObrasPdf(obras ?? [], dreMonth)}
                onExcel={() => exportObrasExcel(obras ?? [], dreMonth)}
              />
            </div>

            {obrasLoading && <div className="empty">Carregando…</div>}
            {obrasError && <div className="empty">Não foi possível carregar o relatório.</div>}
            {obras && obras.length === 0 && (
              <div className="empty">Nenhuma movimentação por obra neste mês.</div>
            )}
            {obras && obras.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th rowSpan={2}>Obra</th>
                    <th colSpan={3} className="group-header group-start">
                      Realizado (caixa)
                    </th>
                    <th colSpan={3} className="group-header group-start">
                      Previsto (competência)
                    </th>
                  </tr>
                  <tr>
                    <th className="r group-start">Receitas</th>
                    <th className="r">Despesas</th>
                    <th className="r">Resultado</th>
                    <th className="r group-start">Receitas</th>
                    <th className="r">Despesas</th>
                    <th className="r">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {obras.map((cc) => (
                    <CostCenterRow key={cc.costCenterId ?? "__null__"} cc={cc} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {detailMonth && <MonthDetailModal month={detailMonth} onClose={() => setDetailMonth(null)} />}
    </>
  );
}
