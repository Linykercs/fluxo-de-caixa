import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateUserInput } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { UserSummary } from "./types";

const USERS_KEY = ["users"] as const;

export function useUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: () => apiFetch<UserSummary[]>("/users"),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiFetch<UserSummary>("/users", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useChangeUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "ADMIN" | "OPERATOR" }) =>
      apiFetch<UserSummary>(`/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
