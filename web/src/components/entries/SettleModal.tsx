import { zodResolver } from "@hookform/resolvers/zod";
import { settleEntrySchema } from "@fluxo/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { useBankAccounts } from "../../api/bank-accounts";
import { ApiError } from "../../api/client";
import { useSettleEntry } from "../../api/settlements";
import type { EntryDetail, EntryDirection } from "../../api/types";
import { todaySP } from "../../lib/dates";
import { formatBRL } from "../../lib/money";
import { CurrencyInput } from "../CurrencyInput";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof settleEntrySchema>;

interface SettleModalProps {
  entry: EntryDetail;
  direction: EntryDirection;
  onClose: () => void;
}

export function SettleModal({ entry, direction, onClose }: SettleModalProps) {
  const { data: accounts } = useBankAccounts();
  const settleEntry = useSettleEntry(direction);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(settleEntrySchema),
    defaultValues: {
      amountCents: entry.remainingCents,
      settledAt: todaySP(),
      bankAccountId: "",
      notes: undefined,
    },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    settleEntry.mutate(
      { entryId: entry.id, input: values },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (err instanceof ApiError && err.field) {
            setError(err.field as keyof FormValues, { message: err.message });
          } else {
            setFormError(err instanceof ApiError ? err.message : "Não foi possível registrar a baixa.");
          }
        },
      },
    );
  }

  return (
    <Modal title="Dar baixa" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <p className="hint" style={{ marginBottom: 12 }}>
          {entry.description} — restante: <strong>{formatBRL(entry.remainingCents)}</strong>
        </p>
        <div className="field">
          <label htmlFor="settle-amount">Valor da baixa</label>
          <Controller
            control={control}
            name="amountCents"
            render={({ field }) => (
              <CurrencyInput id="settle-amount" valueCents={field.value} onChange={field.onChange} />
            )}
          />
          {errors.amountCents && <div className="field-error">{errors.amountCents.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="settle-date">Data</label>
          <input id="settle-date" type="date" required {...register("settledAt")} />
          {errors.settledAt && <div className="field-error">{errors.settledAt.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="settle-account">Conta bancária</label>
          <select id="settle-account" {...register("bankAccountId")}>
            <option value="">Selecione…</option>
            {accounts
              ?.filter((account) => !account.archivedAt)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
          {errors.bankAccountId && <div className="field-error">{errors.bankAccountId.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="settle-notes">Observações</label>
          <textarea
            id="settle-notes"
            {...register("notes", { setValueAs: (value) => (value === "" ? undefined : value) })}
          />
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={settleEntry.isPending}>
            {settleEntry.isPending ? "Salvando…" : "Confirmar baixa"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
