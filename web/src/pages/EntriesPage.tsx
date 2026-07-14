import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useBankAccounts } from "../api/bank-accounts";
import { useCategories } from "../api/categories";
import { useCostCenters } from "../api/cost-centers";
import { ApiError } from "../api/client";
import { useDeleteEntry, useEntries } from "../api/entries";
import type { EntryDetail, EntryDirection, EntryStatus } from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ExportDropdown } from "../components/ExportDropdown";
import { EditEntryModal } from "../components/entries/EditEntryModal";
import { EntryDetailModal } from "../components/entries/EntryDetailModal";
import { EntryStatusChip } from "../components/entries/EntryStatusChip";
import { NewEntryModal } from "../components/entries/NewEntryModal";
import { RecurrenceScopeModal } from "../components/entries/RecurrenceScopeModal";
import { SettleModal } from "../components/entries/SettleModal";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import { counterpartyLabel } from "../lib/counterparty";
import { addMonths, currentMonth, formatDate, formatMonthLong } from "../lib/dates";
import { exportTableExcel, exportTablePdf } from "../lib/export";
import { formatBRL } from "../lib/money";

/** Busca sem caixa nem acento ("credito" acha "Crédito"). */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const STATUS_LABELS: Record<EntryStatus, string> = {
  OPEN: "Aberto",
  OVERDUE: "Vencida",
  SETTLED: "Paga",
};

type ModalState =
  | { kind: "new" }
  | { kind: "detail"; entryId: string }
  | { kind: "settle"; entry: EntryDetail }
  | { kind: "edit"; entry: EntryDetail }
  | { kind: "recurrence-edit"; entry: EntryDetail }
  | { kind: "delete"; entry: EntryDetail }
  | null;

interface EntriesPageProps {
  direction: EntryDirection;
}

const TITLES: Record<EntryDirection, string> = {
  PAYABLE: "A pagar",
  RECEIVABLE: "A receber",
};

export function EntriesPage({ direction }: EntriesPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get("month") ?? currentMonth();
  const [status, setStatus] = useState<EntryStatus | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Atalho do PWA e links diretos: /a-pagar?novo=1 abre o modal de novo lançamento.
  useEffect(() => {
    if (searchParams.get("novo") === "1") {
      setModal({ kind: "new" });
      const next = new URLSearchParams(searchParams);
      next.delete("novo");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const categoryKind = direction === "PAYABLE" ? "EXPENSE" : "INCOME";
  const { data: categories } = useCategories(categoryKind);
  const { data: costCenters } = useCostCenters();
  const { data: accounts } = useBankAccounts();
  const { data: entries, isLoading, isFetching, isError } = useEntries(direction, {
    month,
    status: status || undefined,
    categoryId: categoryId || undefined,
    costCenterId: costCenterId || undefined,
    bankAccountId: bankAccountId || undefined,
  });
  const deleteEntry = useDeleteEntry(direction);

  const needle = normalize(search.trim());
  const filteredEntries = entries?.filter(
    (entry) =>
      needle === "" ||
      normalize(entry.description).includes(needle) ||
      normalize(entry.counterparty).includes(needle),
  );
  const totalCents = filteredEntries?.reduce((sum, entry) => sum + entry.amountCents, 0) ?? 0;

  function buildExport() {
    const list = filteredEntries ?? [];
    return {
      title: `${TITLES[direction]}, ${formatMonthLong(month)}`,
      filename: `${direction === "PAYABLE" ? "a-pagar" : "a-receber"}-${month}`,
      head: ["Descrição", counterpartyLabel(direction), "Categoria", "Centro de custo", "Vencimento", "Valor", "Status"],
      rows: list.map((entry) => [
        entry.description +
          (entry.installmentTotal ? ` (${entry.installmentNumber}/${entry.installmentTotal})` : "") +
          (entry.recurrenceId ? " (recorrente)" : ""),
        entry.counterparty,
        categories?.find((category) => category.id === entry.categoryId)?.name ?? "",
        costCenters?.find((costCenter) => costCenter.id === entry.costCenterId)?.name ?? "",
        formatDate(entry.dueDate),
        formatBRL(entry.amountCents),
        entry.status !== "SETTLED" && entry.settledCents > 0 ? "Parcial" : STATUS_LABELS[entry.status],
      ]),
      foot: [[`Total (${list.length})`, "", "", "", "", formatBRL(totalCents), ""]],
      orientation: "l" as const,
      rightAlign: [5],
    };
  }

  function goToMonth(target: string) {
    setSearchParams({ month: target });
  }

  function openDelete(entry: EntryDetail) {
    setDeleteError(null);
    setModal({ kind: "delete", entry });
  }

  function confirmDelete(entry: EntryDetail) {
    setDeleteError(null);
    deleteEntry.mutate(entry.id, {
      onSuccess: () => setModal(null),
      onError: (err) => {
        setDeleteError(err instanceof ApiError ? err.message : "Não foi possível excluir.");
      },
    });
  }

  return (
    <>
      <div className="page-head">
        <h2>{TITLES[direction]}</h2>
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

      <div className="toolbar">
        <div className="filters">
          <input
            type="search"
            className="search-input"
            placeholder="Buscar descrição ou nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar lançamentos"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value as EntryStatus | "")}>
            <option value="">Status: todos</option>
            <option value="OPEN">Aberto</option>
            <option value="OVERDUE">Vencida</option>
            <option value="SETTLED">Paga</option>
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Categoria: todas</option>
            {categories?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
            <option value="">Centro de custo: todos</option>
            {costCenters?.map((costCenter) => (
              <option key={costCenter.id} value={costCenter.id}>
                {costCenter.name}
              </option>
            ))}
          </select>
          <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
            <option value="">Conta: todas</option>
            {accounts
              ?.filter((account) => !account.archivedAt)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </div>
        <div className="spacer" />
        <ExportDropdown
          disabled={!filteredEntries || filteredEntries.length === 0}
          onPdf={() => exportTablePdf(buildExport())}
          onExcel={() => exportTableExcel(buildExport(), TITLES[direction])}
        />
        <button type="button" className="btn-primary hide-mobile" onClick={() => setModal({ kind: "new" })}>
          + Novo lançamento
        </button>
      </div>

      <button type="button" className="fab" aria-label="Novo lançamento" onClick={() => setModal({ kind: "new" })}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <div className={`table-scroll entries-table${isFetching && !isLoading ? " is-refetching" : ""}`}>
        <table className="entry-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>{counterpartyLabel(direction)}</th>
              <th>Categoria</th>
              <th>Centro de custo</th>
              <th>Vencimento</th>
              <th className="r">Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              [0, 1, 2, 3].map((i) => (
                <SkeletonRow key={i} widths={["70%", "50%", "60%", "50%", 70, 80, 60]} />
              ))}
            {isError && (
              <tr>
                <td colSpan={7} className="hint">
                  Não foi possível carregar os lançamentos.
                </td>
              </tr>
            )}
            {!isLoading && !isError && filteredEntries?.length === 0 && (
              <tr>
                <td colSpan={7} className="hint">
                  {needle ? "Nenhum lançamento encontrado pra essa busca." : "Nenhum lançamento neste mês."}
                </td>
              </tr>
            )}
            {filteredEntries?.map((entry) => (
              <tr key={entry.id} onClick={() => setModal({ kind: "detail", entryId: entry.id })}>
                <td>
                  <div className="cell-main">
                    {entry.description}
                    {entry.installmentTotal && (
                      <span className="tag">
                        {entry.installmentNumber}/{entry.installmentTotal}
                      </span>
                    )}
                    {entry.recurrenceId && <span className="tag">Recorrente</span>}
                  </div>
                </td>
                <td>{entry.counterparty}</td>
                <td>{categories?.find((category) => category.id === entry.categoryId)?.name ?? "—"}</td>
                <td>{costCenters?.find((costCenter) => costCenter.id === entry.costCenterId)?.name ?? "—"}</td>
                <td>{formatDate(entry.dueDate)}</td>
                <td className="r money">{formatBRL(entry.amountCents)}</td>
                <td>
                  <EntryStatusChip entry={entry} />
                </td>
              </tr>
            ))}
            {!isLoading && !isError && filteredEntries && filteredEntries.length > 0 && (
              <tr className="total-row">
                <td colSpan={5}>
                  Total ({filteredEntries.length} lançamento{filteredEntries.length === 1 ? "" : "s"})
                </td>
                <td className="r money">{formatBRL(totalCents)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Versão em cards da mesma lista; o CSS decide qual aparece pelo breakpoint */}
      <div className={`entry-cards${isFetching && !isLoading ? " is-refetching" : ""}`}>
        {isLoading &&
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={64} style={{ borderRadius: 12 }} />)}
        {isError && <div className="empty">Não foi possível carregar os lançamentos.</div>}
        {!isLoading && !isError && filteredEntries?.length === 0 && (
          <div className="empty">
            {needle ? "Nenhum lançamento encontrado pra essa busca." : "Nenhum lançamento neste mês. Toque em + para criar."}
          </div>
        )}
        {filteredEntries?.map((entry) => (
          <button
            type="button"
            className="entry-card"
            key={entry.id}
            onClick={() => setModal({ kind: "detail", entryId: entry.id })}
          >
            <span className="ec-main">
              <span className="ec-title">
                {entry.description}
                {entry.installmentTotal && (
                  <span className="tag">
                    {entry.installmentNumber}/{entry.installmentTotal}
                  </span>
                )}
                {entry.recurrenceId && <span className="tag">Recorrente</span>}
              </span>
              <span className="ec-sub">
                {entry.counterparty} · {formatDate(entry.dueDate)}
              </span>
            </span>
            <span className="ec-side">
              <span className="money ec-amount">{formatBRL(entry.amountCents)}</span>
              <EntryStatusChip entry={entry} />
            </span>
          </button>
        ))}
        {!isLoading && !isError && filteredEntries && filteredEntries.length > 0 && (
          <div className="entry-cards-total">
            <span>
              Total ({filteredEntries.length} lançamento{filteredEntries.length === 1 ? "" : "s"})
            </span>
            <b className="money">{formatBRL(totalCents)}</b>
          </div>
        )}
      </div>

      {modal?.kind === "new" && <NewEntryModal direction={direction} onClose={() => setModal(null)} />}

      {modal?.kind === "detail" && (
        <EntryDetailModal
          entryId={modal.entryId}
          direction={direction}
          onClose={() => setModal(null)}
          onSettle={(entry) => setModal({ kind: "settle", entry })}
          onEdit={(entry) => setModal({ kind: "edit", entry })}
          onEditRecurrence={(entry) => setModal({ kind: "recurrence-edit", entry })}
          onDelete={openDelete}
        />
      )}

      {modal?.kind === "settle" && (
        <SettleModal entry={modal.entry} direction={direction} onClose={() => setModal(null)} />
      )}

      {modal?.kind === "edit" && (
        <EditEntryModal entry={modal.entry} direction={direction} onClose={() => setModal(null)} />
      )}

      {modal?.kind === "recurrence-edit" && (
        <RecurrenceScopeModal entry={modal.entry} direction={direction} onClose={() => setModal(null)} />
      )}

      {modal?.kind === "delete" && (
        <ConfirmDialog
          title="Excluir lançamento"
          message={`Excluir "${modal.entry.description}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          danger
          pending={deleteEntry.isPending}
          error={deleteError}
          onConfirm={() => confirmDelete(modal.entry)}
          onCancel={() => setModal(null)}
        />
      )}
    </>
  );
}
