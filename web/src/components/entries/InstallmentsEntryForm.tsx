import { zodResolver } from "@hookform/resolvers/zod";
import { createInstallmentsEntrySchema } from "@fluxo/shared";
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

type FormValues = z.infer<typeof createInstallmentsEntrySchema>;

interface InstallmentsEntryFormProps {
  direction: EntryDirection;
  onSuccess: () => void;
}

export function InstallmentsEntryForm({ direction, onSuccess }: InstallmentsEntryFormProps) {
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
    resolver: zodResolver(createInstallmentsEntrySchema),
    defaultValues: {
      kind: "installments",
      description: "",
      counterparty: "",
      categoryId: "",
      costCenterId: undefined,
      notes: undefined,
      totalCents: 0,
      installmentTotal: 2,
      firstDueDate: todaySP(),
      firstCompetenceMonth: currentMonth(),
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
          <label htmlFor="inst-description">Descrição</label>
          <input id="inst-description" {...register("description")} />
          {errors.description && <div className="field-error">{errors.description.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="inst-counterparty">{counterpartyLabel(direction)}</label>
          <input id="inst-counterparty" {...register("counterparty")} />
          {errors.counterparty && <div className="field-error">{errors.counterparty.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="inst-category">Categoria</label>
          <select id="inst-category" {...register("categoryId")}>
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
          <label htmlFor="inst-cost-center">Centro de custo</label>
          <select
            id="inst-cost-center"
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
          <label htmlFor="inst-total">Valor total</label>
          <Controller
            control={control}
            name="totalCents"
            render={({ field }) => (
              <CurrencyInput id="inst-total" valueCents={field.value} onChange={field.onChange} />
            )}
          />
          {errors.totalCents && <div className="field-error">{errors.totalCents.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="inst-count">Número de parcelas</label>
          <input
            id="inst-count"
            type="number"
            min={2}
            {...register("installmentTotal", { valueAsNumber: true })}
          />
          {errors.installmentTotal && <div className="field-error">{errors.installmentTotal.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="inst-first-due">Primeiro vencimento</label>
          <input id="inst-first-due" type="date" required {...register("firstDueDate")} />
          {errors.firstDueDate && <div className="field-error">{errors.firstDueDate.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="inst-first-competence">Primeira competência</label>
          <input id="inst-first-competence" type="month" required {...register("firstCompetenceMonth")} />
          {errors.firstCompetenceMonth && <div className="field-error">{errors.firstCompetenceMonth.message}</div>}
        </div>
        <div className="field full">
          <label htmlFor="inst-notes">Observações</label>
          <textarea
            id="inst-notes"
            {...register("notes", { setValueAs: (value) => (value === "" ? undefined : value) })}
          />
        </div>
      </div>
      <div className="hint" style={{ marginBottom: 12 }}>
        O valor total é dividido em parcelas mensais iguais; o resto da divisão fica na última parcela.
      </div>
      <div className="modal-footer">
        <button type="submit" className="btn-primary" disabled={createEntry.isPending}>
          {createEntry.isPending ? "Salvando…" : "Criar parcelamento"}
        </button>
      </div>
    </form>
  );
}
