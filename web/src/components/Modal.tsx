import type { MouseEvent, ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: "sm" | "md" | "lg";
}

export function Modal({ title, onClose, children, width = "md" }: ModalProps) {
  function stopPropagation(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal modal-${width}`} onClick={stopPropagation}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
