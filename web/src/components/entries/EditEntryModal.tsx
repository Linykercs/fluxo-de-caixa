import { zodResolver } from "@hookform/resolvers/zod";
import { updateEntrySchema } from "@fluxo/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useCategories } from "../../api/categories";
import { useCostCenters } from "../../api/cost-centers";
import { useUpdateEntry } from "../../api/entries";
import type { EntryDetail, EntryDirection } from "../../api/types";
import { counterpartyLabel } from "../../lib/counterparty";
import { CurrencyInput } from "../CurrencyInput";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof updateEntrySchema>;

interface EditEntryModalProps {
  entry: EntryDetail;
  direction: EntryDirection;
  onClose: () => void;
}

export function EditEntryModal({ entry, direction, onClose }: EditEntryModalProps) {
  const categoryKind = direction === "PAYABLE" ? "EXPENSE" : "INCOME";
  const { data: categories } = useCategories(categoryKind);
  const { data: costCenters } = useCostCenters();
  const updateEntry = useUpdateEntry(direction);
  const [formError, setFormError] = useState<string | null>(null);
  const locked = entry.settledCents > 0;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(updateEntrySchema),
    defaultValues: {
      description: entry.description,
      counterparty: entry.counterparty,
      categoryId: entry.categoryId,
      costCenterId: entry.costCenterId ?? "",
      notes: entry.notes ?? "",
      amountCents: entry.amountCents,
      dueDate: entry.dueDate,
      competenceMonth: entry.competenceMonth,
    },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    updateEntry.mutate(
      { id: entry.id, changes: values },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (err instanceof ApiError && err.field) {
            setError(err.field as keyof FormValues, { message: err.message });
          } else {
            setFormError(err instanceof ApiError ? err.message : "Não foi possível salvar.");
          }
        },
      },
    );
  }

  return (
    <Modal title="Editar lançamento" onClose={onClose} width="lg">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="edit-description">Descrição</label>
            <input id="edit-description" {...register("description")} />
            {errors.description && <div className="field-error">{errors.description.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="edit-counterparty">{counterpartyLabel(direction)}</label>
            <input id="edit-counterparty" {...register("counterparty")} />
            {errors.counterparty && <div className="field-error">{errors.counterparty.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="edit-category">Categoria</label>
            <select id="edit-category" {...register("categoryId")}>
              {categories?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.categoryId && <div className="field-error">{errors.categoryId.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="edit-cost-center">Centro de custo</label>
            <select
              id="edit-cost-center"
              {...register("costCenterId", { setValueAs: (value) => (value === "" ? null : value) })}
            >
              <option value="">Nenhum</option>
              {costCenters?.map((costCenter) => (
                <option key={costCenter.id} value={costCenter.id}>
                  {costCenter.name}
                </option>
              ))}
            </select>
            {errors.costCenterId && <div className="field-error">{errors.costCenterId.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="edit-amount">Valor</label>
            <Controller
              control={control}
              name="amountCents"
              disabled={locked}
              render={({ field }) => (
                <CurrencyInput
                  id="edit-amount"
                  valueCents={field.value ?? 0}
                  onChange={field.onChange}
                  disabled={field.disabled}
                />
              )}
            />
            {locked && <div className="hint">Lançamento com baixa: valor travado</div>}
            {errors.amountCents && <div className="field-error">{errors.amountCents.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="edit-due-date">Vencimento</label>
            <input id="edit-due-date" type="date" {...register("dueDate", { disabled: locked })} />
            {locked && <div className="hint">Lançamento com baixa: vencimento travado</div>}
            {errors.dueDate && <div className="field-error">{errors.dueDate.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="edit-competence">Competência</label>
            <input id="edit-competence" type="month" {...register("competenceMonth", { disabled: locked })} />
            {locked && <div className="hint">Lançamento com baixa: competência travada</div>}
            {errors.competenceMonth && <div className="field-error">{errors.competenceMonth.message}</div>}
          </div>
          <div className="field full">
            <label htmlFor="edit-notes">Observações</label>
            <textarea
              id="edit-notes"
              {...register("notes", { setValueAs: (value) => (value === "" ? null : value) })}
            />
            {errors.notes && <div className="field-error">{errors.notes.message}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={updateEntry.isPending}>
            {updateEntry.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
