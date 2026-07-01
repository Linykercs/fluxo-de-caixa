import { useState } from "react";
import { ApiError } from "../../api/client";
import {
  useCounterpartyTelegramStatus,
  useRegenerateCounterpartyTelegramToken,
  useTestCounterpartyTelegram,
  useUnlinkCounterpartyTelegram,
} from "../../api/counterparties";
import type { Counterparty } from "../../api/types";
import { Modal } from "../Modal";

interface CounterpartyTelegramModalProps {
  counterparty: Counterparty;
  onClose: () => void;
}

export function CounterpartyTelegramModal({ counterparty, onClose }: CounterpartyTelegramModalProps) {
  const { data: status, isLoading } = useCounterpartyTelegramStatus(counterparty.id);
  const regenerate = useRegenerateCounterpartyTelegramToken(counterparty.id);
  const unlink = useUnlinkCounterpartyTelegram(counterparty.id);
  const test = useTestCounterpartyTelegram(counterparty.id);
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
    <Modal title={`Telegram — ${counterparty.name}`} onClose={onClose} width="sm">
      {isLoading && <p className="hint">Carregando…</p>}

      {status && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p className="hint" style={{ margin: 0 }}>
            Quando o pagamento desse cliente vencer e não for baixado, a cobrança automática avisa por aqui.
          </p>

          {status.linked ? (
            <>
              <div style={{ color: "#166534", background: "#dcfce7", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>
                ✅ Conectado.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" className="btn-primary" onClick={handleTest} disabled={test.isPending}>
                  {test.isPending ? "Enviando…" : "Testar envio"}
                </button>
                <button type="button" className="btn-link" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
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
              <div style={{ color: "#92400e", background: "#fef3c7", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>
                ⚠️ Ainda não conectado.
              </div>
              {status.botUsername ? (
                <>
                  <p style={{ margin: 0, fontSize: 14 }}>
                    Manda esse link pro cliente abrir e tocar em <b>Iniciar</b> no Telegram:
                  </p>
                  {inviteUrl && (
                    <code style={{ fontSize: 12, wordBreak: "break-all", background: "#f4f4f4", padding: 8, borderRadius: 6 }}>
                      {inviteUrl}
                    </code>
                  )}
                </>
              ) : (
                <p className="hint" style={{ margin: 0 }}>Bot do Telegram não configurado no servidor.</p>
              )}
              <div>
                <button type="button" className="btn-link" onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
                  Gerar novo link
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
