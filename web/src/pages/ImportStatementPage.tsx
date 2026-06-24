import { useState } from "react";
import type { ImportConfirmRow } from "@fluxo/shared";
import { ApiError } from "../api/client";
import { useBankAccounts } from "../api/bank-accounts";
import { useConfirmImport, usePreviewImport } from "../api/bank-import";
import { useCategories } from "../api/categories";
import { useCostCenters } from "../api/cost-centers";
import type { Category, CostCenter, ImportConfirmResult, ImportConfirmStatus, ImportPreviewRow } from "../api/types";
import { formatDate, formatDayMonth } from "../lib/dates";
import { formatBRL } from "../lib/money";

type Destination =
  | { kind: "settle"; entryId: string }
  | { kind: "create"; counterpartyDescription: string; categoryId: string; costCenterId?: string }
  | { kind: "ignore" };

interface ReviewRow {
  preview: ImportPreviewRow;
  destination: Destination;
  result?: ImportConfirmResult;
}

const DONE_STATUSES = new Set<ImportConfirmStatus>(["settled", "created", "ignored", "duplicate"]);

const RESULT_LABELS: Record<ImportConfirmStatus, string> = {
  settled: "Baixado",
  created: "Lançamento criado",
  ignored: "Ignorado",
  duplicate: "Já importado",
  error: "Erro",
};

function resultChipClass(status: ImportConfirmStatus): string {
  switch (status) {
    case "settled":
    case "created":
      return "chip paid";
    case "error":
      return "chip overdue";
    default:
      return "chip open";
  }
}

function initialDestination(row: ImportPreviewRow): Destination {
  const [firstCandidate] = row.candidates;
  if (firstCandidate && (row.status === "matched" || row.status === "ambiguous")) {
    return { kind: "settle", entryId: firstCandidate.entryId };
  }
  if (row.status === "unmatched") {
    return { kind: "create", counterpartyDescription: row.description, categoryId: "", costCenterId: undefined };
  }
  return { kind: "ignore" };
}

function destinationValue(destination: Destination): string {
  switch (destination.kind) {
    case "settle":
      return `settle:${destination.entryId}`;
    case "create":
      return "create";
    case "ignore":
      return "ignore";
  }
}

function isResolved(row: ReviewRow): boolean {
  return row.preview.status === "duplicate" || (row.result !== undefined && DONE_STATUSES.has(row.result.status));
}

function toConfirmRow(row: ReviewRow): ImportConfirmRow {
  const { fitid, date, amountCents, description } = row.preview;
  switch (row.destination.kind) {
    case "settle":
      return { fitid, date, amountCents, description, action: "settle", entryId: row.destination.entryId };
    case "create":
      return {
        fitid,
        date,
        amountCents,
        description,
        action: "create",
        newEntry: {
          description: row.destination.counterpartyDescription,
          counterparty: row.destination.counterpartyDescription,
          categoryId: row.destination.categoryId,
          costCenterId: row.destination.costCenterId,
        },
      };
    case "ignore":
      return { fitid, date, amountCents, description, action: "ignore" };
  }
}

export function ImportStatementPage() {
  const { data: accounts } = useBankAccounts();
  const { data: expenseCategories } = useCategories("EXPENSE");
  const { data: incomeCategories } = useCategories("INCOME");
  const { data: costCenters } = useCostCenters();

  const [bankAccountId, setBankAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const previewImport = usePreviewImport();
  const confirmImport = useConfirmImport();

  const activeAccounts = accounts?.filter((account) => !account.archivedAt) ?? [];
  const selectedAccountId = bankAccountId || activeAccounts[0]?.id || "";

  function handleAnalyze() {
    if (!selectedAccountId || !file) return;
    setPreviewError(null);
    setConfirmError(null);
    previewImport.mutate(
      { bankAccountId: selectedAccountId, file },
      {
        onSuccess: (data) => {
          setRows(data.map((preview) => ({ preview, destination: initialDestination(preview) })));
        },
        onError: (err) => {
          setPreviewError(err instanceof ApiError ? err.message : "Não foi possível analisar o arquivo.");
        },
      },
    );
  }

  function handleReset() {
    setRows(null);
    setFile(null);
    setFileInputKey((key) => key + 1);
    setPreviewError(null);
    setConfirmError(null);
    previewImport.reset();
    confirmImport.reset();
  }

  function updateRow(fitid: string, updater: (row: ReviewRow) => ReviewRow) {
    setRows((current) => current?.map((row) => (row.preview.fitid === fitid ? updater(row) : row)) ?? null);
  }

  function handleConfirm() {
    if (!rows) return;
    const pending = rows.filter((row) => !isResolved(row));
    if (pending.length === 0) return;
    setConfirmError(null);
    confirmImport.mutate(
      { bankAccountId: selectedAccountId, rows: pending.map(toConfirmRow) },
      {
        onSuccess: (results) => {
          const byFitid = new Map(results.map((result) => [result.fitid, result]));
          setRows(
            (current) =>
              current?.map((row) => {
                const result = byFitid.get(row.preview.fitid);
                return result ? { ...row, result } : row;
              }) ?? null,
          );
        },
        onError: (err) => {
          setConfirmError(err instanceof ApiError ? err.message : "Não foi possível confirmar a importação.");
        },
      },
    );
  }

  const pendingRows = rows?.filter((row) => !isResolved(row)) ?? [];
  const canConfirm =
    pendingRows.length > 0 &&
    pendingRows.every((row) => row.destination.kind !== "create" || row.destination.categoryId !== "");
  const allDone = rows !== null && rows.length > 0 && rows.every(isResolved);

  const counts = (rows ?? []).reduce(
    (acc, row) => {
      if (row.preview.status === "duplicate") acc.duplicate += 1;
      else if (row.destination.kind === "settle") acc.settle += 1;
      else if (row.destination.kind === "create") acc.create += 1;
      else acc.ignore += 1;
      return acc;
    },
    { settle: 0, create: 0, ignore: 0, duplicate: 0 },
  );

  return (
    <>
      <div className="page-head">
        <h2>Importar extrato</h2>
      </div>

      <div className="cards-grid cols-1">
        <div className="card">
          <div className="card-header">
            <span>1. Selecionar arquivo</span>
          </div>
          <div className="import-upload">
            <div className="field">
              <label htmlFor="import-account">Conta bancária</label>
              <select
                id="import-account"
                value={selectedAccountId}
                disabled={activeAccounts.length === 0}
                onChange={(event) => setBankAccountId(event.target.value)}
              >
                {activeAccounts.length === 0 && <option value="">Nenhuma conta ativa</option>}
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="import-file">Arquivo OFX</label>
              <input
                id="import-file"
                key={fileInputKey}
                type="file"
                accept=".ofx"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={!selectedAccountId || !file || previewImport.isPending}
              onClick={handleAnalyze}
            >
              {previewImport.isPending ? "Analisando…" : "Analisar arquivo"}
            </button>
          </div>
          {previewError && <div className="form-error">{previewError}</div>}
        </div>

        {rows && (
          <div className="card">
            <div className="card-header">
              <span>2. Revisar e confirmar</span>
              <button type="button" className="btn-link" onClick={handleReset}>
                Importar outro arquivo
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="empty">O extrato não contém transações.</div>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th className="r">Valor</th>
                      <th>Destino</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <ImportRow
                        key={row.preview.fitid}
                        row={row}
                        categories={(row.preview.amountCents < 0 ? expenseCategories : incomeCategories) ?? []}
                        costCenters={costCenters ?? []}
                        disabled={confirmImport.isPending}
                        onChange={(updater) => updateRow(row.preview.fitid, updater)}
                      />
                    ))}
                  </tbody>
                </table>

                <div className="card-footer">
                  <div className="card-footer-row">
                    <span className="hint">
                      {counts.settle} {counts.settle === 1 ? "vai ser baixado" : "vão ser baixados"} · {counts.create}{" "}
                      {counts.create === 1 ? "novo lançamento" : "novos lançamentos"} · {counts.duplicate}{" "}
                      {counts.duplicate === 1 ? "duplicado" : "duplicados"} · {counts.ignore} ignorado
                      {counts.ignore === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!canConfirm || confirmImport.isPending}
                      onClick={handleConfirm}
                    >
                      {confirmImport.isPending ? "Confirmando…" : "Confirmar importação"}
                    </button>
                  </div>
                  {confirmError && <div className="form-error">{confirmError}</div>}
                  {allDone && (
                    <div className="hint">
                      Importação concluída. Confira os lançamentos em A pagar, A receber ou Contas bancárias.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

interface ImportRowProps {
  row: ReviewRow;
  categories: Category[];
  costCenters: CostCenter[];
  disabled: boolean;
  onChange: (updater: (row: ReviewRow) => ReviewRow) => void;
}

function ImportRow({ row, categories, costCenters, disabled, onChange }: ImportRowProps) {
  const { preview, destination, result } = row;
  const isDuplicate = preview.status === "duplicate";
  const isDone = isDuplicate || (result !== undefined && result.status !== "error");

  function handleDestinationChange(value: string) {
    if (value === "create") {
      onChange((r) => ({
        ...r,
        destination: { kind: "create", counterpartyDescription: r.preview.description, categoryId: "", costCenterId: undefined },
      }));
    } else if (value === "ignore") {
      onChange((r) => ({ ...r, destination: { kind: "ignore" } }));
    } else if (value.startsWith("settle:")) {
      const entryId = value.slice("settle:".length);
      onChange((r) => ({ ...r, destination: { kind: "settle", entryId } }));
    }
  }

  function updateCreateFields(patch: Partial<{ counterpartyDescription: string; categoryId: string; costCenterId?: string }>) {
    onChange((r) => (r.destination.kind === "create" ? { ...r, destination: { ...r.destination, ...patch } } : r));
  }

  return (
    <tr className={isDuplicate ? "row-muted" : undefined}>
      <td>{formatDate(preview.date)}</td>
      <td>{preview.description}</td>
      <td className={`r money ${preview.amountCents < 0 ? "neg" : "pos"}`}>{formatBRL(preview.amountCents)}</td>
      <td className="import-dest">
        {isDuplicate ? (
          <span className="hint">Já importado</span>
        ) : (
          <>
            {isDone ? (
              <span className={resultChipClass(result!.status)}>{RESULT_LABELS[result!.status]}</span>
            ) : (
              <select value={destinationValue(destination)} disabled={disabled} onChange={(event) => handleDestinationChange(event.target.value)}>
                {preview.candidates.map((candidate) => (
                  <option key={candidate.entryId} value={`settle:${candidate.entryId}`}>
                    Baixar {candidate.description} (venc. {formatDayMonth(candidate.dueDate)})
                  </option>
                ))}
                <option value="create">Criar novo lançamento</option>
                <option value="ignore">Ignorar</option>
              </select>
            )}

            {!isDone && destination.kind === "create" && (
              <div className="import-create-fields">
                <select
                  value={destination.categoryId}
                  disabled={disabled}
                  onChange={(event) => updateCreateFields({ categoryId: event.target.value })}
                >
                  <option value="">Selecione…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <select
                  value={destination.costCenterId ?? ""}
                  disabled={disabled}
                  onChange={(event) => updateCreateFields({ costCenterId: event.target.value || undefined })}
                >
                  <option value="">Nenhum</option>
                  {costCenters.map((costCenter) => (
                    <option key={costCenter.id} value={costCenter.id}>
                      {costCenter.name}
                    </option>
                  ))}
                </select>
                <input
                  value={destination.counterpartyDescription}
                  disabled={disabled}
                  placeholder="Contraparte/Descrição"
                  onChange={(event) => updateCreateFields({ counterpartyDescription: event.target.value })}
                />
              </div>
            )}

            {result?.status === "error" && <div className="field-error">{result.error?.message}</div>}
          </>
        )}
      </td>
    </tr>
  );
}
