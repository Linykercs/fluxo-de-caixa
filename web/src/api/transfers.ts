import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTransferInput } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { Transfer } from "./types";

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransferInput) =>
      apiFetch<Transfer>("/transfers", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["statement"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
