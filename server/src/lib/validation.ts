// Validação na borda com zod (spec §6): payload fora do formato esperado →
// HTTP 400 { field, message } apontando o primeiro campo inválido.
import type { ZodType } from "zod";

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    throw new ValidationError(field, issue.message);
  }
  return result.data;
}
