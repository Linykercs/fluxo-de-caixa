import { useState } from "react";
import { useBankAccounts } from "../../api/bank-accounts";
import { useCategories } from "../../api/categories";
import { useCostCenters } from "../../api/cost-centers";
import { ApiError } from "../../api/client";
import { useEntry } from "../../api/entries";
import { useReverseSettlement } from "../../api/settlements";
import type { EntryDetail, EntryDirection } from "../../api/types";
import { counterpartyLabel } from "../../lib/counterparty";
import { formatDate, formatMonthLong } from "../../lib/dates";
import { formatBRL } from "../../lib/money";
import { Modal } from "../Modal";
import { EntryStatusChip } from "./EntryStatusChip";

interface EntryDetailModalProps {
  entryId: string;
  direction: EntryDirection;
  onClose: () => void;
  onSettle: (entry: EntryDetail) => void;
  onEdit: (entry: EntryDetail) => void;
  onEditRecurrence: (entry: EntryDetail) => void;
  onDelete: (entry: EntryDetail) => void;
}

export function EntryDetailModal({
  entryId,
  direction,
  onClose,
  onSettle,
  onEdit,
  onEditRecurrence,
  onDelete,
}: EntryDetailModalProps) {
  const { data: entry, isLoading } = useEntry(entryId);
  const { data: categories } = useCategories();
  const { data: costCenters } = useCostCenters();
  const { data: accounts } = useBankAccounts();
  const reverseSettlement = useReverseSettlement(direction);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseError, setReverseError] = useState<string | null>(null);

  function accountName(bankAccountId: string): string {
    return accounts?.find((account) => account.id === bankAccountId)?.name ?? "—";
  }

  function confirmReverse(settlementId: string) {
    setReverseError(null);
    reverseSettlement.mutate(
      { settlementId, entryId },
      {
        onSuccess: () => setReversingId(null),
        onError: (err) => {
          setReverseError(err instanceof ApiError ? err.message : "Não foi possível estornar a baixa.");
        },
      },
    );
  }

  return (
    <Modal title="Detalhe do lançamento" onClose={onClose} width="lg">
      {isLoading || !entry ? (
        <p className="hint">Carregando…</p>
      ) : (
        <>
          <div className="detail-grid">
            <div className="full">
              <div className="lbl">Descrição</div>
              <div className="val">
                {entry.description}
                {entry.installmentTotal && (
                  <span className="tag">
                    {entry.installmentNumber}/{entry.installmentTotal}
                  </span>
                )}
                {entry.recurrenceId && <span className="tag">Recorrente</span>}
              </div>
            </div>
            <div>
              <div className="lbl">{counterpartyLabel(direction)}</div>
              <div className="val">{entry.counterparty}</div>
            </div>
            <div>
              <div className="lbl">Categoria</div>
              <div className="val">{categories?.find((category) => category.id === entry.categoryId)?.name ?? "—"}</div>
            </div>
            <div>
              <div className="lbl">Centro de custo</div>
              <div className="val">
                {costCenters?.find((costCenter) => costCenter.id === entry.costCenterId)?.name ?? "—"}
              </div>
            </div>
            <div>
              <div className="lbl">Vencimento</div>
              <div className="val">{formatDate(entry.dueDate)}</div>
            </div>
            <div>
              <div className="lbl">Competência</div>
              <div className="val">{formatMonthLong(entry.competenceMonth)}</div>
            </div>
            <div>
              <div className="lbl">Valor total</div>
              <div className="val">{formatBRL(entry.amountCents)}</div>
            </div>
            <div>
              <div className="lbl">Status</div>
              <div className="val">
                <EntryStatusChip entry={entry} />
              </div>
            </div>
            <div>
              <div className="lbl">Pago</div>
              <div className="val">{formatBRL(entry.settledCents)}</div>
            </div>
            <div>
              <div className="lbl">Restante</div>
              <div className="val">{formatBRL(entry.remainingCents)}</div>
            </div>
            {entry.notes && (
              <div className="full">
                <div className="lbl">Observações</div>
                <div className="val">{entry.notes}</div>
              </div>
            )}
          </div>

          <div className="detail-section-title">Histórico de baixas</div>
          {entry.settlements.length === 0 ? (
            <p className="hint">Nenhuma baixa registrada.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th className="r">Valor</th>
                  <th>Conta</th>
                  <th>Observações</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entry.settlements
                  .slice()
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                  .map((settlement) => {
                    const isReversal = settlement.reversalOfId !== null;
                    const isReversed = settlement.reversedById !== null;
                    return (
                      <tr key={settlement.id}>
                        <td>{formatDate(settlement.settledAt)}</td>
                        <td className={`r money ${settlement.amountCents < 0 ? "neg" : ""}`}>
                          {formatBRL(settlement.amountCents)}
                        </td>
                        <td>{accountName(settlement.bankAccountId)}</td>
                        <td>{settlement.notes ?? "—"}</td>
                        <td>
                          {isReversal && <span className="tag">Estorno</span>}
                          {!isReversal && isReversed && <span className="tag">Estornada</span>}
                          {!isReversal && !isReversed && reversingId === settlement.id && (
                            <span className="inline-confirm">
                              <button
                                type="button"
                                className="btn-link danger"
                                disabled={reverseSettlement.isPending}
                                onClick={() => confirmReverse(settlement.id)}
                              >
                                Confirmar
                              </button>
                              <button type="button" className="btn-link" onClick={() => setReversingId(null)}>
                                Cancelar
                              </button>
                            </span>
                          )}
                          {!isReversal && !isReversed && reversingId !== settlement.id && (
                            <button type="button" className="btn-link danger" onClick={() => setReversingId(settlement.id)}>
                              Estornar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
          {reverseError && <div className="form-error">{reverseError}</div>}

          <div className="detail-actions">
            {entry.remainingCents > 0 && (
              <button type="button" className="btn-primary" onClick={() => onSettle(entry)}>
                Dar baixa
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => onEdit(entry)}>
              Editar
            </button>
            {entry.recurrenceId && (
              <button type="button" className="btn-secondary" onClick={() => onEditRecurrence(entry)}>
                Editar recorrência
              </button>
            )}
            <button
              type="button"
              className="btn-danger"
              disabled={entry.settledCents > 0}
              title={entry.settledCents > 0 ? "Lançamentos com baixa não podem ser excluídos" : undefined}
              onClick={() => onDelete(entry)}
            >
              Excluir
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
