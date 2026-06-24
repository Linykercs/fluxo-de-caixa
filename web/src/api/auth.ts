import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { Me } from "./types";

export type UpdateProfileInput = {
  name?: string;
  email?: string;
  currentPassword: string;
  newPassword?: string;
};

const ME_KEY = ["auth", "me"] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => apiFetch<Me>("/auth/me"),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiFetch<Me>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (me) => {
      queryClient.setQueryData(ME_KEY, me);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useIsAdmin(): boolean {
  const { data: me } = useMe();
  return me?.role === "ADMIN";
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      apiFetch<Me>("/users/me", { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: (me) => {
      queryClient.setQueryData(ME_KEY, me);
    },
  });
}
