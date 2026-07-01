import { zodResolver } from "@hookform/resolvers/zod";
import { createCounterpartySchema } from "@fluxo/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useCreateCounterparty } from "../../api/counterparties";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof createCounterpartySchema>;

interface NewCounterpartyModalProps {
  onClose: () => void;
}

export function NewCounterpartyModal({ onClose }: NewCounterpartyModalProps) {
  const createCounterparty = useCreateCounterparty();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createCounterpartySchema),
    defaultValues: { name: "", phoneNumber: "" },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    createCounterparty.mutate(
      { ...values, phoneNumber: values.phoneNumber || undefined },
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
    <Modal title="Novo cliente" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="field">
          <label htmlFor="new-counterparty-name">Nome</label>
          <input id="new-counterparty-name" {...register("name")} />
          {errors.name && <div className="field-error">{errors.name.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="new-counterparty-phone">WhatsApp (opcional)</label>
          <input id="new-counterparty-phone" placeholder="(11) 99999-8888" {...register("phoneNumber")} />
          <div className="hint">Usado pra régua de cobrança automática por WhatsApp.</div>
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={createCounterparty.isPending}>
            {createCounterparty.isPending ? "Salvando…" : "Criar cliente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
