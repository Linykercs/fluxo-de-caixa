import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  danger,
  pending,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel} width="sm">
      <p>{message}</p>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={pending}>
          {pending ? "Aguarde…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
