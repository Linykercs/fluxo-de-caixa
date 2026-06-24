import { zodResolver } from "@hookform/resolvers/zod";
import { createCostCenterSchema } from "@fluxo/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useCreateCostCenter } from "../../api/cost-centers";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof createCostCenterSchema>;

interface NewCostCenterModalProps {
  onClose: () => void;
}

export function NewCostCenterModal({ onClose }: NewCostCenterModalProps) {
  const createCostCenter = useCreateCostCenter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createCostCenterSchema),
    defaultValues: { name: "" },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    createCostCenter.mutate(values, {
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
    <Modal title="Novo centro de custo" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="field">
          <label htmlFor="new-cost-center-name">Nome</label>
          <input id="new-cost-center-name" {...register("name")} />
          {errors.name && <div className="field-error">{errors.name.message}</div>}
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={createCostCenter.isPending}>
            {createCostCenter.isPending ? "Salvando…" : "Criar centro de custo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
