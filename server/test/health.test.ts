import { describe, expect, it } from "vitest";
import { loginSchema } from "@fluxo/shared";
import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  it("responde ok", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("@fluxo/shared", () => {
  it("schema compartilhado é importável e valida", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "inválido", password: "x" }).success).toBe(false);
  });
});
