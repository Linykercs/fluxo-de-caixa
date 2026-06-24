import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ImportConfirmRow } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { ImportConfirmResult, ImportPreviewRow } from "./types";

export function usePreviewImport() {
  return useMutation({
    mutationFn: ({ bankAccountId, file }: { bankAccountId: string; file: File }) => {
      const formData = new FormData();
      formData.set("file", file);
      return apiFetch<ImportPreviewRow[]>(`/bank-accounts/${bankAccountId}/import/preview`, {
        method: "POST",
        body: formData,
      });
    },
  });
}

export function useConfirmImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bankAccountId, rows }: { bankAccountId: string; rows: ImportConfirmRow[] }) =>
      apiFetch<ImportConfirmResult[]>(`/bank-accounts/${bankAccountId}/import/confirm`, {
        method: "POST",
        body: JSON.stringify(rows),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["statement"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
