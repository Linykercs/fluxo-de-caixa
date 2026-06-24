import { zodResolver } from "@hookform/resolvers/zod";
import { updateCategorySchema } from "@fluxo/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { useUpdateCategory } from "../../api/categories";
import type { Category } from "../../api/types";
import { Modal } from "../Modal";

type FormValues = z.infer<typeof updateCategorySchema>;

interface EditCategoryModalProps {
  category: Category;
  onClose: () => void;
}

export function EditCategoryModal({ category, onClose }: EditCategoryModalProps) {
  const updateCategory = useUpdateCategory();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(updateCategorySchema),
    defaultValues: { name: category.name, archived: Boolean(category.archivedAt) },
  });

  function onSubmit(values: FormValues) {
    setFormError(null);
    updateCategory.mutate(
      { id: category.id, changes: values },
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
    <Modal title="Editar categoria" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        {formError && <div className="form-error">{formError}</div>}
        <div className="field">
          <label htmlFor="edit-category-name">Nome</label>
          <input id="edit-category-name" {...register("name")} />
          {errors.name && <div className="field-error">{errors.name.message}</div>}
        </div>
        <div className="checkbox-field">
          <label htmlFor="edit-category-archived">
            <input id="edit-category-archived" type="checkbox" {...register("archived")} />
            Categoria arquivada
          </label>
          <div className="hint">Categorias arquivadas saem dos formulários de novos lançamentos.</div>
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={updateCategory.isPending}>
            {updateCategory.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
