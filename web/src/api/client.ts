const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:3333" : "");

interface ErrorBody {
  code?: string;
  field?: string;
  message?: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  field?: string;

  constructor(status: number, message: string, opts: { code?: string; field?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = opts.code;
    this.field = opts.field;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = init.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    const errorBody = (body ?? {}) as ErrorBody;
    throw new ApiError(res.status, errorBody.message ?? res.statusText, {
      code: errorBody.code,
      field: errorBody.field,
    });
  }

  return body as T;
}
