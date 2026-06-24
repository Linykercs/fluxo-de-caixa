import type { Entry } from "../../api/types";

const LABELS: Record<Entry["status"], string> = {
  OPEN: "Aberto",
  OVERDUE: "Vencida",
  SETTLED: "Paga",
};

const CLASSES: Record<Entry["status"], string> = {
  OPEN: "open",
  OVERDUE: "overdue",
  SETTLED: "paid",
};

/** Chip de status; lançamentos com baixa parcial (aberto/vencido + settledCents > 0) mostram "Parcial". */
export function EntryStatusChip({ entry }: { entry: Pick<Entry, "status" | "settledCents"> }) {
  if (entry.status !== "SETTLED" && entry.settledCents > 0) {
    return <span className="chip partial">Parcial</span>;
  }
  return <span className={`chip ${CLASSES[entry.status]}`}>{LABELS[entry.status]}</span>;
}
