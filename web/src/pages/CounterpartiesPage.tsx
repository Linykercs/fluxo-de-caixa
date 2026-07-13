import { useState } from "react";
import { useCounterparties } from "../api/counterparties";
import type { Counterparty } from "../api/types";
import { CounterpartyTelegramModal } from "../components/counterparties/CounterpartyTelegramModal";
import { EditCounterpartyModal } from "../components/counterparties/EditCounterpartyModal";
import { NewCounterpartyModal } from "../components/counterparties/NewCounterpartyModal";

type ModalState =
  | { kind: "new" }
  | { kind: "edit"; counterparty: Counterparty }
  | { kind: "telegram"; counterparty: Counterparty }
  | null;

export function CounterpartiesPage() {
  const { data: counterparties, isLoading, isError } = useCounterparties();
  const [modal, setModal] = useState<ModalState>(null);

  if (isLoading) return <p className="page-state">Carregando clientes…</p>;
  if (isError || !counterparties)
    return <p className="page-state">Não foi possível carregar os clientes. Verifique a conexão e recarregue a página.</p>;

  return (
    <>
      <div className="page-head">
        <h2>Clientes</h2>
      </div>

      <div className="toolbar">
        <div className="spacer" />
        <button type="button" className="btn-primary" onClick={() => setModal({ kind: "new" })}>
          + Novo cliente
        </button>
      </div>

      <div className="cards-grid cols-1">
        <div className="card">
          <div className="card-header">
            <span>Clientes</span>
          </div>
          {counterparties.length === 0 ? (
            <div className="empty">Nenhum cliente cadastrado.</div>
          ) : (
            <div className="table-scroll">
              <table className="stack-mobile">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>WhatsApp</th>
                    <th>Telegram</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {counterparties.map((counterparty) => (
                    <tr key={counterparty.id}>
                      <td>
                        {counterparty.name}
                        {counterparty.archivedAt && <span className="tag">Arquivado</span>}
                      </td>
                      <td data-label="WhatsApp">{counterparty.phoneNumber ?? "—"}</td>
                      <td data-label="Telegram">{counterparty.telegramChatId ? "Conectado" : "—"}</td>
                      <td className="r">
                        <button type="button" className="btn-link" onClick={() => setModal({ kind: "telegram", counterparty })}>
                          Telegram
                        </button>{" "}
                        <button type="button" className="btn-link" onClick={() => setModal({ kind: "edit", counterparty })}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal?.kind === "new" && <NewCounterpartyModal onClose={() => setModal(null)} />}
      {modal?.kind === "edit" && <EditCounterpartyModal counterparty={modal.counterparty} onClose={() => setModal(null)} />}
      {modal?.kind === "telegram" && (
        <CounterpartyTelegramModal counterparty={modal.counterparty} onClose={() => setModal(null)} />
      )}
    </>
  );
}
