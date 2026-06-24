import { zodResolver } from "@hookform/resolvers/zod";
import { updateBankAccountSchema } from "@fluxo/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useUpdateBankAccount } from "../../api/bank-accounts";
import type { BankAccountSummary } from "../../api/types";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof updateBankAccountSchema>;

interface EditAccountModalProps {
  account: BankAccountSummary;
  onClose: () => void;
}

export function EditAccountModal({ account, onClose }: EditAccountModalProps) {
  const updateAccount = useUpdateBankAccount();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(updateBankAccountSchema),
    defaultValues: { name: account.name, archived: Boolean(account.archivedAt) },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    updateAccount.mutate(
      { id: account.id, changes: values },
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
    <Modal title="Editar conta bancária" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="field">
          <label htmlFor="edit-account-name">Nome</label>
          <input id="edit-account-name" {...register("name")} />
          {errors.name && <div className="field-error">{errors.name.message}</div>}
        </div>
        <div className="checkbox-field">
          <label htmlFor="edit-account-archived">
            <input id="edit-account-archived" type="checkbox" {...register("archived")} />
            Conta arquivada
          </label>
          <div className="hint">Contas arquivadas saem da lista de saldos e não recebem transferências.</div>
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={updateAccount.isPending}>
            {updateAccount.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
