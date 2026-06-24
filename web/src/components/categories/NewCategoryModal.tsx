import { zodResolver } from "@hookform/resolvers/zod";
import { createCategorySchema } from "@fluxo/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useCreateCategory } from "../../api/categories";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof createCategorySchema>;

interface NewCategoryModalProps {
  onClose: () => void;
}

export function NewCategoryModal({ onClose }: NewCategoryModalProps) {
  const createCategory = useCreateCategory();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: { name: "", kind: "EXPENSE" },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    createCategory.mutate(values, {
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
    <Modal title="Nova categoria" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="field">
          <label htmlFor="new-category-name">Nome</label>
          <input id="new-category-name" {...register("name")} />
          {errors.name && <div className="field-error">{errors.name.message}</div>}
        </div>
        <div className="field">
          <label htmlFor="new-category-kind">Tipo</label>
          <select id="new-category-kind" {...register("kind")}>
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Receita</option>
          </select>
          {errors.kind && <div className="field-error">{errors.kind.message}</div>}
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={createCategory.isPending}>
            {createCategory.isPending ? "Salvando…" : "Criar categoria"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
