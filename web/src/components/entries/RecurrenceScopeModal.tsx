import { zodResolver } from "@hookform/resolvers/zod";
import { recurrenceScopeSchema } from "@fluxo/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useCategories } from "../../api/categories";
import { useUpdateRecurrenceScope } from "../../api/entries";
import type { EntryDetail, EntryDirection } from "../../api/types";
import { counterpartyLabel } from "../../lib/counterparty";
import { CurrencyInput } from "../CurrencyInput";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof recurrenceScopeSchema>;

interface RecurrenceScopeModalProps {
  entry: EntryDetail;
  direction: EntryDirection;
  onClose: () => void;
}

export function RecurrenceScopeModal({ entry, direction, onClose }: RecurrenceScopeModalProps) {
  const categoryKind = direction === "PAYABLE" ? "EXPENSE" : "INCOME";
  const { data: categories } = useCategories(categoryKind);
  const updateScope = useUpdateRecurrenceScope(direction);
  const [formError, setFormError] = useState<string | null>(null);
  const locked = entry.settledCents > 0;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(recurrenceScopeSchema),
    defaultValues: {
      scope: "only_this",
      description: entry.description,
      counterparty: entry.counterparty,
      categoryId: entry.categoryId,
      amountCents: entry.amountCents,
      dueDay: Number(entry.dueDate.slice(8, 10)),
    },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    updateScope.mutate(
      { id: entry.id, input: values },
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
    <Modal title="Editar recorrência" onClose={onClose} width="lg">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="radio-group">
          <label>
            <input type="radio" value="only_this" {...register("scope")} />
            Somente esta ocorrência
          </label>
          <label>
            <input type="radio" value="this_and_future" {...register("scope")} />
            Esta e as ocorrências futuras
          </label>
        </div>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="rec-edit-description">Descrição</label>
            <input id="rec-edit-description" {...register("description")} />
            {errors.description && <div className="field-error">{errors.description.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="rec-edit-counterparty">{counterpartyLabel(direction)}</label>
            <input id="rec-edit-counterparty" {...register("counterparty")} />
            {errors.counterparty && <div className="field-error">{errors.counterparty.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="rec-edit-category">Categoria</label>
            <select id="rec-edit-category" {...register("categoryId")}>
              {categories?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.categoryId && <div className="field-error">{errors.categoryId.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="rec-edit-amount">Valor</label>
            <Controller
              control={control}
              name="amountCents"
              disabled={locked}
              render={({ field }) => (
                <CurrencyInput
                  id="rec-edit-amount"
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
            <label htmlFor="rec-edit-due-day">Dia do vencimento</label>
            <input
              id="rec-edit-due-day"
              type="number"
              min={1}
              max={31}
              {...register("dueDay", { valueAsNumber: true })}
            />
            {errors.dueDay && <div className="field-error">{errors.dueDay.message}</div>}
          </div>
        </div>
        <div className="hint" style={{ marginBottom: 12 }}>
          "Esta e as futuras" aplica as alterações a partir desta ocorrência; ocorrências já pagas não são
          alteradas.
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={updateScope.isPending}>
            {updateScope.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
