import type { EntryDirection } from "../api/types";

export function counterpartyLabel(direction: EntryDirection): "Fornecedor" | "Cliente" {
  return direction === "PAYABLE" ? "Fornecedor" : "Cliente";
}
