import { useState } from "react";
import { ApiError } from "../../api/client";
import { useCancelBudget, useCreateBudget, useUpdateBudget } from "../../api/budgets";
import type { BudgetReportRow } from "../../api/types";
import { formatMonthLong } from "../../lib/dates";
import { CurrencyInput } from "../CurrencyInput";
import { Modal } from "../Modal";

interface BudgetModalProps {
  row: BudgetReportRow;
  month: string;
  onClose: () => void;
}

export function BudgetModal({ row, month, onClose }: BudgetModalProps) {
  const [amountCents, setAmountCents] = useState(row.budgetedCents);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const cancel = useCancelBudget();

  const isPending = create.isPending || update.isPending || cancel.isPending;

  function handleError(err: unknown) {
    setError(err instanceof ApiError ? err.message : "Não foi possível salvar.");
  }

  function handleSave() {
    setError(null);
    if (amountCents <= 0) {
      setError("Valor deve ser maior que zero.");
      return;
    }
    if (row.budgetId) {
      update.mutate(
        { id: row.budgetId, amountCents, effectiveMonth: month },
        { onSuccess: onClose, onError: handleError },
      );
    } else {
      create.mutate(
        { categoryId: row.categoryId, amountCents, startMonth: month },
        { onSuccess: onClose, onError: handleError },
      );
    }
  }

  function handleRemove() {
    if (!row.budgetId) return;
    setError(null);
    cancel.mutate({ id: row.budgetId, effectiveMonth: month }, { onSuccess: onClose, onError: handleError });
  }

  return (
    <Modal title={`Orçamento — ${row.categoryName}`} onClose={onClose} width="sm">
      <p className="hint">
        Valor mensal recorrente a partir de <b>{formatMonthLong(month)}</b>. Meses anteriores mantêm o valor que já
        estava vigente.
      </p>
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="budget-amount">Valor orçado por mês</label>
        <CurrencyInput id="budget-amount" valueCents={amountCents} onChange={setAmountCents} />
      </div>
      <div className="modal-footer">
        {row.budgetId && (
          <button type="button" className="btn-link" onClick={handleRemove} disabled={isPending}>
            Remover a partir deste mês
          </button>
        )}
        <button type="button" className="btn-primary" onClick={handleSave} disabled={isPending}>
          {isPending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}
