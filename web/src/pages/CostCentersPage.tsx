import { useState } from "react";
import { useCostCenters } from "../api/cost-centers";
import type { CostCenter } from "../api/types";
import { EditCostCenterModal } from "../components/cost-centers/EditCostCenterModal";
import { NewCostCenterModal } from "../components/cost-centers/NewCostCenterModal";

type ModalState = { kind: "new" } | { kind: "edit"; costCenter: CostCenter } | null;

export function CostCentersPage() {
  const { data: costCenters, isLoading, isError } = useCostCenters();
  const [modal, setModal] = useState<ModalState>(null);

  if (isLoading) {
    return <p>Carregando…</p>;
  }

  if (isError || !costCenters) {
    return <p>Não foi possível carregar os centros de custo.</p>;
  }

  return (
    <>
      <div className="page-head">
        <h2>Centros de custo</h2>
      </div>

      <div className="toolbar">
        <div className="spacer" />
        <button type="button" className="btn-primary" onClick={() => setModal({ kind: "new" })}>
          + Novo centro de custo
        </button>
      </div>

      <div className="cards-grid cols-1">
        <div className="card">
          <div className="card-header">
            <span>Centros de custo</span>
          </div>
          {costCenters.length === 0 ? (
            <div className="empty">Nenhum centro de custo cadastrado.</div>
          ) : (
            <table>
              <tbody>
                {costCenters.map((costCenter) => (
                  <tr key={costCenter.id}>
                    <td>{costCenter.name}</td>
                    <td className="r">
                      <button type="button" className="btn-link" onClick={() => setModal({ kind: "edit", costCenter })}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal?.kind === "new" && <NewCostCenterModal onClose={() => setModal(null)} />}
      {modal?.kind === "edit" && <EditCostCenterModal costCenter={modal.costCenter} onClose={() => setModal(null)} />}
    </>
  );
}
