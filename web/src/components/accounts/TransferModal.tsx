import { zodResolver } from "@hookform/resolvers/zod";
import { createTransferSchema } from "@fluxo/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useBankAccounts } from "../../api/bank-accounts";
import { useCreateTransfer } from "../../api/transfers";
import { todaySP } from "../../lib/dates";
import { CurrencyInput } from "../CurrencyInput";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof createTransferSchema>;

interface TransferModalProps {
  onClose: () => void;
}

export function TransferModal({ onClose }: TransferModalProps) {
  const { data: accounts } = useBankAccounts();
  const createTransfer = useCreateTransfer();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createTransferSchema),
    defaultValues: {
      fromAccountId: "",
      toAccountId: "",
      amountCents: 0,
      date: todaySP(),
      notes: undefined,
    },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    createTransfer.mutate(values, {
      onSuccess: onClose,
      onError: (err) => {
        if (err instanceof ApiError && err.field) {
          setError(err.field as keyof FormValues, { message: err.message });
        } else {
          setFormError(err instanceof ApiError ? err.message : "Não foi possível transferir.");
        }
      },
    });
  }

  const activeAccounts = accounts?.filter((account) => !account.archivedAt) ?? [];

  return (
    <Modal title="Transferência entre contas" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="field">
          <label htmlFor="transfer-from">De</label>
          <select id="transfer-from" {...register("fromAccountId")}>
            <option value="">Selecione…</option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          {errors.fromAccountId && <div className="field-error">{errors.fromAccountId.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="transfer-to">Para</label>
          <select id="transfer-to" {...register("toAccountId")}>
            <option value="">Selecione…</option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          {errors.toAccountId && <div className="field-error">{errors.toAccountId.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="transfer-amount">Valor</label>
          <Controller
            control={control}
            name="amountCents"
            render={({ field }) => (
              <CurrencyInput id="transfer-amount" valueCents={field.value} onChange={field.onChange} />
            )}
          />
          {errors.amountCents && <div className="field-error">{errors.amountCents.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="transfer-date">Data</label>
          <input id="transfer-date" type="date" required {...register("date")} />
          {errors.date && <div className="field-error">{errors.date.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="transfer-notes">Observações</label>
          <textarea
            id="transfer-notes"
            {...register("notes", { setValueAs: (value) => (value === "" ? undefined : value) })}
          />
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={createTransfer.isPending}>
            {createTransfer.isPending ? "Transferindo…" : "Transferir"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
