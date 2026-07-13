import { useState } from "react";
import { useCategories } from "../api/categories";
import type { Category } from "../api/types";
import { EditCategoryModal } from "../components/categories/EditCategoryModal";
import { NewCategoryModal } from "../components/categories/NewCategoryModal";

type ModalState = { kind: "new" } | { kind: "edit"; category: Category } | null;

export function CategoriesPage() {
  const { data: categories, isLoading, isError } = useCategories();
  const [modal, setModal] = useState<ModalState>(null);

  if (isLoading) {
    return <p className="page-state">Carregando categorias…</p>;
  }

  if (isError || !categories) {
    return <p className="page-state">Não foi possível carregar as categorias. Verifique a conexão e recarregue a página.</p>;
  }

  const expenses = categories.filter((category) => category.kind === "EXPENSE");
  const incomes = categories.filter((category) => category.kind === "INCOME");

  return (
    <>
      <div className="page-head">
        <h2>Categorias</h2>
      </div>

      <div className="toolbar">
        <div className="spacer" />
        <button type="button" className="btn-primary" onClick={() => setModal({ kind: "new" })}>
          + Nova categoria
        </button>
      </div>

      <div className="cards-grid">
        <CategoryListCard title="Despesas" categories={expenses} onEdit={(category) => setModal({ kind: "edit", category })} />
        <CategoryListCard title="Receitas" categories={incomes} onEdit={(category) => setModal({ kind: "edit", category })} />
      </div>

      {modal?.kind === "new" && <NewCategoryModal onClose={() => setModal(null)} />}
      {modal?.kind === "edit" && <EditCategoryModal category={modal.category} onClose={() => setModal(null)} />}
    </>
  );
}

interface CategoryListCardProps {
  title: string;
  categories: Category[];
  onEdit: (category: Category) => void;
}

function CategoryListCard({ title, categories, onEdit }: CategoryListCardProps) {
  return (
    <div className="card">
      <div className="card-header">
        <span>{title}</span>
      </div>
      {categories.length === 0 ? (
        <div className="empty">Nenhuma categoria cadastrada.</div>
      ) : (
        <table>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td className="r">
                  <button type="button" className="btn-link" onClick={() => onEdit(category)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
