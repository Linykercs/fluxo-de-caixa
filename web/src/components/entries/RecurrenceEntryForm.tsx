import { zodResolver } from "@hookform/resolvers/zod";
import { createRecurrenceEntrySchema } from "@fluxo/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useCategories } from "../../api/categories";
import { useCostCenters } from "../../api/cost-centers";
import { useCreateEntry } from "../../api/entries";
import type { EntryDirection } from "../../api/types";
import { CurrencyInput } from "../CurrencyInput";
import { counterpartyLabel } from "../../lib/counterparty";
import { currentMonth } from "../../lib/dates";

type FormValues = z.infer<typeof createRecurrenceEntrySchema>;

interface RecurrenceEntryFormProps {
  direction: EntryDirection;
  onSuccess: () => void;
}

export function RecurrenceEntryForm({ direction, onSuccess }: RecurrenceEntryFormProps) {
  const categoryKind = direction === "PAYABLE" ? "EXPENSE" : "INCOME";
  const { data: categories } = useCategories(categoryKind);
  const { data: costCenters } = useCostCenters();
  const createEntry = useCreateEntry(direction);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createRecurrenceEntrySchema),
    defaultValues: {
      kind: "recurrence",
      description: "",
      counterparty: "",
      categoryId: "",
      costCenterId: undefined,
      amountCents: 0,
      dueDay: 1,
      startMonth: currentMonth(),
      endMonth: undefined,
    },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    createEntry.mutate(values, {
      onSuccess,
      onError: (err) => {
        if (err instanceof ApiError && err.field) {
          setError(err.field as keyof FormValues, { message: err.message });
        } else {
          setFormError(err instanceof ApiError ? err.message : "Não foi possível salvar.");
        }
      },
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {formError && <div className="form-error">{formError}</div>}
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="rec-description">Descrição</label>
          <input id="rec-description" {...register("description")} />
          {errors.description && <div className="field-error">{errors.description.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="rec-counterparty">{counterpartyLabel(direction)}</label>
          <input id="rec-counterparty" {...register("counterparty")} />
          {errors.counterparty && <div className="field-error">{errors.counterparty.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="rec-category">Categoria</label>
          <select id="rec-category" {...register("categoryId")}>
            <option value="">Selecione…</option>
            {categories?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId && <div className="field-error">{errors.categoryId.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="rec-cost-center">Centro de custo</label>
          <select
            id="rec-cost-center"
            {...register("costCenterId", { setValueAs: (value) => (value === "" ? undefined : value) })}
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
          <label htmlFor="rec-amount">Valor</label>
          <Controller
            control={control}
            name="amountCents"
            render={({ field }) => (
              <CurrencyInput id="rec-amount" valueCents={field.value} onChange={field.onChange} />
            )}
          />
          {errors.amountCents && <div className="field-error">{errors.amountCents.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="rec-due-day">Dia do vencimento</label>
          <input id="rec-due-day" type="number" min={1} max={31} {...register("dueDay", { valueAsNumber: true })} />
          <div className="hint">Em meses curtos, usa o último dia do mês</div>
          {errors.dueDay && <div className="field-error">{errors.dueDay.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="rec-start">Mês inicial</label>
          <input id="rec-start" type="month" required {...register("startMonth")} />
          {errors.startMonth && <div className="field-error">{errors.startMonth.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="rec-end">Mês final (opcional)</label>
          <input
            id="rec-end"
            type="month"
            {...register("endMonth", { setValueAs: (value) => (value === "" ? undefined : value) })}
          />
          {errors.endMonth && <div className="field-error">{errors.endMonth.message}</div>}
        </div>
      </div>
      <div className="hint" style={{ marginBottom: 12 }}>
        Gera lançamentos mensais automaticamente (horizonte de 12 meses, renovado conforme o tempo passa).
      </div>
      <div className="modal-footer">
        <button type="submit" className="btn-primary" disabled={createEntry.isPending}>
          {createEntry.isPending ? "Salvando…" : "Criar recorrência"}
        </button>
      </div>
    </form>
  );
}
