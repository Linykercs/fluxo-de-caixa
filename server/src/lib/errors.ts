// Erro de regra de negócio → HTTP 422 { code, message } (spec §6).
export class BusinessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}

// Recurso inexistente (ou soft-deletado) → HTTP 404.
export class NotFoundError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NotFoundError";
  }
}
