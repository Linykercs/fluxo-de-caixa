import { zodResolver } from "@hookform/resolvers/zod";
import { updateCostCenterSchema } from "@fluxo/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useUpdateCostCenter } from "../../api/cost-centers";
import type { CostCenter } from "../../api/types";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof updateCostCenterSchema>;

interface EditCostCenterModalProps {
  costCenter: CostCenter;
  onClose: () => void;
}

export function EditCostCenterModal({ costCenter, onClose }: EditCostCenterModalProps) {
  const updateCostCenter = useUpdateCostCenter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(updateCostCenterSchema),
    defaultValues: { name: costCenter.name, archived: Boolean(costCenter.archivedAt) },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    updateCostCenter.mutate(
      { id: costCenter.id, changes: values },
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
    <Modal title="Editar centro de custo" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="field">
          <label htmlFor="edit-cost-center-name">Nome</label>
          <input id="edit-cost-center-name" {...register("name")} />
          {errors.name && <div className="field-error">{errors.name.message}</div>}
        </div>
        <div className="checkbox-field">
          <label htmlFor="edit-cost-center-archived">
            <input id="edit-cost-center-archived" type="checkbox" {...register("archived")} />
            Centro de custo arquivado
          </label>
          <div className="hint">Centros de custo arquivados saem dos formulários de novos lançamentos.</div>
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={updateCostCenter.isPending}>
            {updateCostCenter.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
