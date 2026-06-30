import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useBankAccounts } from "../api/bank-accounts";
import { useCategories } from "../api/categories";
import { useCostCenters } from "../api/cost-centers";
import { ApiError } from "../api/client";
import { useDeleteEntry, useEntries } from "../api/entries";
import type { EntryDetail, EntryDirection, EntryStatus } from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditEntryModal } from "../components/entries/EditEntryModal";
import { EntryDetailModal } from "../components/entries/EntryDetailModal";
import { EntryStatusChip } from "../components/entries/EntryStatusChip";
import { NewEntryModal } from "../components/entries/NewEntryModal";
import { RecurrenceScopeModal } from "../components/entries/RecurrenceScopeModal";
import { SettleModal } from "../components/entries/SettleModal";
import { counterpartyLabel } from "../lib/counterparty";
import { addMonths, currentMonth, formatDate, formatMonthLong } from "../lib/dates";
import { formatBRL } from "../lib/money";

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
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const categoryKind = direction === "PAYABLE" ? "EXPENSE" : "INCOME";
  const { data: categories } = useCategories(categoryKind);
  const { data: costCenters } = useCostCenters();
  const { data: accounts } = useBankAccounts();
  const { data: entries, isLoading, isError } = useEntries(direction, {
    month,
    status: status || undefined,
    categoryId: categoryId || undefined,
    costCenterId: costCenterId || undefined,
    bankAccountId: bankAccountId || undefined,
  });
  const deleteEntry = useDeleteEntry(direction);

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
        <button type="button" className="btn-primary" onClick={() => setModal({ kind: "new" })}>
          + Novo lançamento
        </button>
      </div>

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
          {isLoading && (
            <tr>
              <td colSpan={7} className="hint">
                Carregando…
              </td>
            </tr>
          )}
          {isError && (
            <tr>
              <td colSpan={7} className="hint">
                Não foi possível carregar os lançamentos.
              </td>
            </tr>
          )}
          {!isLoading && !isError && entries?.length === 0 && (
            <tr>
              <td colSpan={7} className="hint">
                Nenhum lançamento neste mês.
              </td>
            </tr>
          )}
          {entries?.map((entry) => (
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
          {!isLoading && !isError && entries && entries.length > 0 && (
            <tr className="total-row">
              <td colSpan={5}>
                Total ({entries.length} lançamento{entries.length === 1 ? "" : "s"})
              </td>
              <td className="r money">{formatBRL(entries.reduce((sum, entry) => sum + entry.amountCents, 0))}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>

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
