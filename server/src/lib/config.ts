// Constantes da v1 (spec seção 2): Brasil fixo. Trocar aqui quando houver
// fuso/moeda configurável por organização.
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error("Variável de ambiente JWT_SECRET é obrigatória em produção.");
}

export const config = {
  timezone: "America/Sao_Paulo",
  currency: "BRL",
  port: Number(process.env.PORT ?? 3333),
  host: process.env.HOST ?? "127.0.0.1",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-apenas-local",
  cookieName: "fluxo_session",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  isProduction,
  serveWeb: process.env.SERVE_WEB === "true" || isProduction,
  webDistPath: process.env.WEB_DIST_PATH ?? "../web/dist",
} as const;
