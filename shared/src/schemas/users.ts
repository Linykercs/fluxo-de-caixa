import { z } from "zod";

export const userRoleSchema = z.enum(["ADMIN", "OPERATOR"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(120),
  role: userRoleSchema.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const changeUserRoleSchema = z.object({
  role: userRoleSchema,
});
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(120).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
