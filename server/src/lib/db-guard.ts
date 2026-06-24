export function assertDbWipeAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DB_WIPE !== "true") {
    throw new Error(
      "Wipe de banco em produção bloqueado. Para autorizar, defina ALLOW_DB_WIPE=true.",
    );
  }
}
