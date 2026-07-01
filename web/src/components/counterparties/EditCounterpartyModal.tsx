import { zodResolver } from "@hookform/resolvers/zod";
import { updateCounterpartySchema } from "@fluxo/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useUpdateCounterparty } from "../../api/counterparties";
import type { Counterparty } from "../../api/types";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof updateCounterpartySchema>;

interface EditCounterpartyModalProps {
  counterparty: Counterparty;
  onClose: () => void;
}

export function EditCounterpartyModal({ counterparty, onClose }: EditCounterpartyModalProps) {
  const updateCounterparty = useUpdateCounterparty();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(updateCounterpartySchema),
    defaultValues: {
      name: counterparty.name,
      phoneNumber: counterparty.phoneNumber ?? "",
      archived: Boolean(counterparty.archivedAt),
    },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    updateCounterparty.mutate(
      { id: counterparty.id, changes: { ...values, phoneNumber: values.phoneNumber || null } },
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
    <Modal title="Editar cliente" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="field">
          <label htmlFor="edit-counterparty-name">Nome</label>
          <input id="edit-counterparty-name" {...register("name")} />
          {errors.name && <div className="field-error">{errors.name.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="edit-counterparty-phone">WhatsApp</label>
          <input id="edit-counterparty-phone" placeholder="(11) 99999-8888" {...register("phoneNumber")} />
        </div>
        <div className="checkbox-field">
          <label htmlFor="edit-counterparty-archived">
            <input id="edit-counterparty-archived" type="checkbox" {...register("archived")} />
            Cliente arquivado
          </label>
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={updateCounterparty.isPending}>
            {updateCounterparty.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
