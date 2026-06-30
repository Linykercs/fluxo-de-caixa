import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import {
  useRegenerateTelegramToken,
  useSetWhatsAppNumber,
  useTelegramStatus,
  useTestTelegram,
  useTestWhatsApp,
  useUnlinkTelegram,
  useWhatsAppStatus,
} from "../api/notifications";

const WHATSAPP_STATUS_LABEL: Record<string, string> = {
  disabled: "Integração desativada no servidor",
  starting: "Iniciando sessão…",
  qr: "Aguardando leitura do QR code",
  connected: "Conectado",
  disconnected: "Desconectado",
};

export function NotificationsPage() {
  const { data: status, isLoading, isError } = useTelegramStatus();
  const regenerate = useRegenerateTelegramToken();
  const unlink = useUnlinkTelegram();
  const test = useTestTelegram();
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);

  const { data: wa, isLoading: waLoading } = useWhatsAppStatus();
  const setWaNumber = useSetWhatsAppNumber();
  const testWa = useTestWhatsApp();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [waTestResult, setWaTestResult] = useState<"ok" | "error" | null>(null);

  useEffect(() => {
    if (wa) setPhoneNumber(wa.phoneNumber ?? "");
  }, [wa]);

  function handleTest() {
    setTestResult(null);
    test.mutate(undefined, {
      onSuccess: () => setTestResult("ok"),
      onError: () => setTestResult("error"),
    });
  }

  function handleSaveNumber(event: FormEvent) {
    event.preventDefault();
    setWaNumber.mutate(phoneNumber || null);
  }

  function handleTestWa() {
    setWaTestResult(null);
    testWa.mutate(undefined, {
      onSuccess: () => setWaTestResult("ok"),
      onError: () => setWaTestResult("error"),
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

        <div className="card">
          <div className="card-header">
            <span>Lembretes por WhatsApp (não oficial)</span>
          </div>

          {waLoading && <div className="empty">Carregando…</div>}

          {wa && (
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, color: "#555" }}>
                Sessão única do servidor (não é por usuário); cadastre aqui o número que deve receber os avisos desta
                organização.
              </p>

              {wa.status === "qr" && wa.qrDataUrl && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                  <p style={{ margin: 0, fontSize: 14 }}>
                    Sessão do bot ainda não conectada. Abra o WhatsApp no celular usado pelo bot → Aparelhos
                    conectados → Conectar um aparelho, e escaneie:
                  </p>
                  <img src={wa.qrDataUrl} alt="QR code de conexão do WhatsApp" style={{ width: 220, height: 220 }} />
                </div>
              )}

              {wa.status !== "connected" && wa.status !== "qr" && (
                <div
                  style={{ color: "#92400e", background: "#fef3c7", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}
                >
                  ⚠️ {WHATSAPP_STATUS_LABEL[wa.status] ?? wa.status}
                </div>
              )}

              {wa.status === "connected" && (
                <div
                  style={{ color: "#166534", background: "#dcfce7", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}
                >
                  ✅ Sessão do bot conectada.
                </div>
              )}

              <form onSubmit={handleSaveNumber} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <label className="field" style={{ flex: 1 }}>
                  <span>Número (com DDD)</span>
                  <input
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="(11) 99999-8888"
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={setWaNumber.isPending}>
                  {setWaNumber.isPending ? "Salvando…" : "Salvar"}
                </button>
              </form>

              {wa.phoneNumber && wa.status === "connected" && (
                <div>
                  <button type="button" className="btn-link" onClick={handleTestWa} disabled={testWa.isPending}>
                    {testWa.isPending ? "Enviando…" : "Enviar mensagem de teste"}
                  </button>
                  {waTestResult === "ok" && <span style={{ color: "#166534", fontSize: 14, marginLeft: 10 }}>Mensagem enviada!</span>}
                  {waTestResult === "error" && (
                    <span style={{ color: "#e94560", fontSize: 14, marginLeft: 10 }}>
                      {testWa.error instanceof ApiError ? testWa.error.message : "Falha ao enviar."}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
