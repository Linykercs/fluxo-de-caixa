import { useState } from "react";

interface ExportDropdownProps {
  onPdf: () => void;
  onExcel: () => void;
  disabled?: boolean;
}

/** Botão "Exportar" com menu PDF/Excel. */
export function ExportDropdown({ onPdf, onExcel, disabled = false }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);

  function handlePdf() {
    setOpen(false);
    onPdf();
  }

  function handleExcel() {
    setOpen(false);
    onExcel();
  }

  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="btn-secondary" disabled={disabled} onClick={() => setOpen((v) => !v)}>
        Exportar ▾
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,.12)",
            minWidth: 130,
            zIndex: 100,
          }}
        >
          <button
            type="button"
            onClick={handlePdf}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--ink)" }}
          >
            PDF
          </button>
          <button
            type="button"
            onClick={handleExcel}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--ink)" }}
          >
            Excel
          </button>
        </div>
      )}
    </div>
  );
}
