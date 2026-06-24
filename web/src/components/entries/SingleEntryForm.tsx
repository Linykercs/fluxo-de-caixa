import { zodResolver } from "@hookform/resolvers/zod";
import { createSingleEntrySchema } from "@fluxo/shared";
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
import { currentMonth, todaySP } from "../../lib/dates";

type FormValues = z.infer<typeof createSingleEntrySchema>;

interface SingleEntryFormProps {
  direction: EntryDirection;
  onSuccess: () => void;
}

export function SingleEntryForm({ direction, onSuccess }: SingleEntryFormProps) {
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
    resolver: zodResolver(createSingleEntrySchema),
    defaultValues: {
      kind: "single",
      description: "",
      counterparty: "",
      categoryId: "",
      costCenterId: undefined,
      notes: undefined,
      amountCents: 0,
      dueDate: todaySP(),
      competenceMonth: undefined,
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
          <label htmlFor="single-description">Descrição</label>
          <input id="single-description" {...register("description")} />
          {errors.description && <div className="field-error">{errors.description.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="single-counterparty">{counterpartyLabel(direction)}</label>
          <input id="single-counterparty" {...register("counterparty")} />
          {errors.counterparty && <div className="field-error">{errors.counterparty.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="single-category">Categoria</label>
          <select id="single-category" {...register("categoryId")}>
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
          <label htmlFor="single-cost-center">Centro de custo</label>
          <select
            id="single-cost-center"
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
          <label htmlFor="single-amount">Valor</label>
          <Controller
            control={control}
            name="amountCents"
            render={({ field }) => (
              <CurrencyInput id="single-amount" valueCents={field.value} onChange={field.onChange} />
            )}
          />
          {errors.amountCents && <div className="field-error">{errors.amountCents.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="single-due-date">Vencimento</label>
          <input id="single-due-date" type="date" required {...register("dueDate")} />
          {errors.dueDate && <div className="field-error">{errors.dueDate.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="single-competence">Competência</label>
          <input
            id="single-competence"
            type="month"
            placeholder={currentMonth()}
            {...register("competenceMonth", { setValueAs: (value) => (value === "" ? undefined : value) })}
          />
          <div className="hint">Padrão: mês do vencimento</div>
          {errors.competenceMonth && <div className="field-error">{errors.competenceMonth.message}</div>}
        </div>
        <div className="field full">
          <label htmlFor="single-notes">Observações</label>
          <textarea
            id="single-notes"
            {...register("notes", { setValueAs: (value) => (value === "" ? undefined : value) })}
          />
        </div>
      </div>
      <div className="modal-footer">
        <button type="submit" className="btn-primary" disabled={createEntry.isPending}>
          {createEntry.isPending ? "Salvando…" : "Criar lançamento"}
        </button>
      </div>
    </form>
  );
}
