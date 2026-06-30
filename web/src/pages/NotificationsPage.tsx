import { useState } from "react";
import { ApiError } from "../api/client";
import {
  useRegenerateTelegramToken,
  useTelegramStatus,
  useTestTelegram,
  useUnlinkTelegram,
} from "../api/notifications";

export function NotificationsPage() {
  const { data: status, isLoading, isError } = useTelegramStatus();
  const regenerate = useRegenerateTelegramToken();
  const unlink = useUnlinkTelegram();
  const test = useTestTelegram();
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);

  function handleTest() {
    setTestResult(null);
    test.mutate(undefined, {
      onSuccess: () => setTestResult("ok"),
      onError: () => setTestResult("error"),
    });
  }

  const inviteUrl =
    status?.botUsername && status.linkToken ? `https://t.me/${status.botUsername}?start=${status.linkToken}` : null;

  return (
    <>
      <div className="page-head">
        <h2>Notificações</h2>
      </div>

      <div className="cards-grid" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-header">
            <span>Lembretes por Telegram</span>
          </div>

          {isLoading && <div className="empty">Carregando…</div>}
          {isError && <div className="empty">Não foi possível carregar as configurações.</div>}

          {status && (
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, color: "#555" }}>
                Avisa automaticamente no Telegram quando um lançamento vence amanhã e quando vence hoje.
              </p>

              {status.linked ? (
                <>
                  <div
                    style={{
                      color: "#166534",
                      background: "#dcfce7",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 14,
                    }}
                  >
                    ✅ Telegram conectado.
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" className="btn-primary" onClick={handleTest} disabled={test.isPending}>
                      {test.isPending ? "Enviando…" : "Enviar mensagem de teste"}
                    </button>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => unlink.mutate()}
                      disabled={unlink.isPending}
                    >
                      Desvincular
                    </button>
                  </div>
                  {testResult === "ok" && <span style={{ color: "#166534", fontSize: 14 }}>Mensagem enviada!</span>}
                  {testResult === "error" && (
                    <span style={{ color: "#e94560", fontSize: 14 }}>
                      {test.error instanceof ApiError ? test.error.message : "Falha ao enviar."}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <div
                    style={{
                      color: "#92400e",
                      background: "#fef3c7",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 14,
                    }}
                  >
                    ⚠️ Telegram ainda não conectado.
                  </div>
                  {status.botUsername ? (
                    <>
                      <p style={{ margin: 0, fontSize: 14 }}>
                        1. Abra o bot{" "}
                        <a href={inviteUrl ?? undefined} target="_blank" rel="noreferrer">
                          @{status.botUsername}
                        </a>{" "}
                        no Telegram (ou escaneie/cole o link abaixo).
                        <br />
                        2. Toque em <b>Iniciar</b>. A vinculação é automática.
                      </p>
                      {inviteUrl && (
                        <code style={{ fontSize: 12, wordBreak: "break-all", background: "#f4f4f4", padding: 8, borderRadius: 6 }}>
                          {inviteUrl}
                        </code>
                      )}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 14, color: "#888" }}>
                      Bot do Telegram ainda não configurado no servidor (TELEGRAM_BOT_USERNAME).
                    </p>
                  )}
                  <div>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => regenerate.mutate()}
                      disabled={regenerate.isPending}
                    >
                      Gerar novo link
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
