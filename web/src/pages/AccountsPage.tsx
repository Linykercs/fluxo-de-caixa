import { useState } from "react";
import { useBankAccounts, useStatement } from "../api/bank-accounts";
import { EditAccountModal } from "../components/accounts/EditAccountModal";
import { NewAccountModal } from "../components/accounts/NewAccountModal";
import { TransferModal } from "../components/accounts/TransferModal";
import { ExportDropdown } from "../components/ExportDropdown";
import type { BankAccountSummary } from "../api/types";
import { formatDate } from "../lib/dates";
import { exportTableExcel, exportTablePdf } from "../lib/export";
import { formatBRL } from "../lib/money";

type ModalState = { kind: "new" } | { kind: "edit"; account: BankAccountSummary } | { kind: "transfer" } | null;

export function AccountsPage() {
  const { data: accounts, isLoading, isError } = useBankAccounts();
  const [modal, setModal] = useState<ModalState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  if (isLoading) {
    return <p className="page-state">Carregando contas…</p>;
  }

  if (isError || !accounts) {
    return <p className="page-state">Não foi possível carregar as contas. Verifique a conexão e recarregue a página.</p>;
  }

  const activeAccounts = accounts.filter((account) => !account.archivedAt);
  const statementAccountId = selectedId ?? activeAccounts[0]?.id ?? "";

  return (
    <>
      <div className="page-head">
        <h2>Contas bancárias</h2>
      </div>

      <div className="toolbar">
        <div className="spacer" />
        <button type="button" className="btn-secondary" onClick={() => setModal({ kind: "transfer" })}>
          Transferência entre contas
        </button>
        <button type="button" className="btn-primary" onClick={() => setModal({ kind: "new" })}>
          + Nova conta
        </button>
      </div>

      <div className="cards-grid cols-1">
        {activeAccounts.length === 0 && <div className="card empty">Nenhuma conta cadastrada.</div>}
        {activeAccounts.map((account) => (
          <div
            key={account.id}
            className={`card account-card${account.id === statementAccountId ? " selected" : ""}`}
            onClick={() => setSelectedId(account.id)}
          >
            <div className="account-card-body">
              <span className="account-card-name">{account.name}</span>
              <span className="val money">{formatBRL(account.balanceCents)}</span>
            </div>
            <div className="account-card-actions">
              <button
                type="button"
                className="btn-link"
                onClick={(event) => {
                  event.stopPropagation();
                  setModal({ kind: "edit", account });
                }}
              >
                Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      <StatementCard accountId={statementAccountId} accounts={activeAccounts} onSelectAccount={setSelectedId} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      {modal?.kind === "new" && <NewAccountModal onClose={() => setModal(null)} />}
      {modal?.kind === "edit" && <EditAccountModal account={modal.account} onClose={() => setModal(null)} />}
      {modal?.kind === "transfer" && <TransferModal onClose={() => setModal(null)} />}
    </>
  );
}

interface StatementCardProps {
  accountId: string;
  accounts: BankAccountSummary[];
  onSelectAccount: (id: string) => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

function StatementCard({ accountId, accounts, onSelectAccount, from, to, onFromChange, onToChange }: StatementCardProps) {
  const { data: statement, isLoading } = useStatement(accountId, {
    from: from || undefined,
    to: to || undefined,
  });

  const accountName = accounts.find((account) => account.id === accountId)?.name ?? "conta";

  function buildExport() {
    const lines = statement?.lines ?? [];
    return {
      title: `Extrato, ${accountName}`,
      filename: `extrato-${accountName.toLowerCase().replace(/\s+/g, "-")}`,
      head: ["Data", "Descrição", "Valor", "Saldo"],
      rows: lines.map((line) => [
        formatDate(line.date),
        line.description,
        formatBRL(line.amountCents),
        formatBRL(line.balanceCents),
      ]),
      foot: [
        ["Saldo inicial", "", "", formatBRL(statement?.openingBalanceCents ?? 0)],
        ["Saldo final", "", "", formatBRL(statement?.closingBalanceCents ?? 0)],
      ],
      rightAlign: [2, 3],
    };
  }

  return (
    <div className="card">
      <div className="card-header">
        <span>Extrato</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ExportDropdown
            disabled={!statement || statement.lines.length === 0}
            onPdf={() => exportTablePdf(buildExport())}
            onExcel={() => exportTableExcel(buildExport(), "Extrato")}
          />
          <select value={accountId} onChange={(event) => onSelectAccount(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="statement-filters">
        <div className="field">
          <label htmlFor="statement-from">De</label>
          <input id="statement-from" type="date" value={from} onChange={(event) => onFromChange(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="statement-to">Até</label>
          <input id="statement-to" type="date" value={to} onChange={(event) => onToChange(event.target.value)} />
        </div>
        {(from || to) && (
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              onFromChange("");
              onToChange("");
            }}
          >
            Limpar período
          </button>
        )}
      </div>

      {isLoading && <div className="empty">Carregando extrato…</div>}

      {statement && (
        <>
          <div className="statement-summary">
            <span>
              Saldo inicial <strong className="money">{formatBRL(statement.openingBalanceCents)}</strong>
            </span>
            <span>
              Saldo final <strong className="money">{formatBRL(statement.closingBalanceCents)}</strong>
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th className="r">Valor</th>
                <th className="r hide-mobile-col">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {statement.lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="hint">
                    Nenhuma movimentação no período.
                  </td>
                </tr>
              )}
              {statement.lines.map((line) => (
                <tr key={line.id}>
                  <td>{formatDate(line.date)}</td>
                  <td>{line.description}</td>
                  <td className={`r money ${line.amountCents < 0 ? "neg" : "pos"}`}>{formatBRL(line.amountCents)}</td>
                  <td className="r money hide-mobile-col">{formatBRL(line.balanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
