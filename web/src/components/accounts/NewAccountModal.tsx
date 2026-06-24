import { zodResolver } from "@hookform/resolvers/zod";
import { createBankAccountSchema } from "@fluxo/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useCreateBankAccount } from "../../api/bank-accounts";
import { CurrencyInput } from "../CurrencyInput";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof createBankAccountSchema>;

interface NewAccountModalProps {
  onClose: () => void;
}

export function NewAccountModal({ onClose }: NewAccountModalProps) {
  const createAccount = useCreateBankAccount();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createBankAccountSchema),
    defaultValues: { name: "", initialBalanceCents: 0 },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    createAccount.mutate(values, {
      onSuccess: onClose,
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
    <Modal title="Nova conta bancária" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="field">
          <label htmlFor="new-account-name">Nome</label>
          <input id="new-account-name" {...register("name")} />
          {errors.name && <div className="field-error">{errors.name.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="new-account-balance">Saldo inicial</label>
          <Controller
            control={control}
            name="initialBalanceCents"
            render={({ field }) => (
              <CurrencyInput id="new-account-balance" valueCents={field.value} onChange={field.onChange} />
            )}
          />
          {errors.initialBalanceCents && <div className="field-error">{errors.initialBalanceCents.message}</div>}
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={createAccount.isPending}>
            {createAccount.isPending ? "Salvando…" : "Criar conta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
