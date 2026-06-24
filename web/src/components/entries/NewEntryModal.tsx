import { useState } from "react";
import type { EntryDirection } from "../../api/types";
import { Modal } from "../Modal";
import { InstallmentsEntryForm } from "./InstallmentsEntryForm";
import { RecurrenceEntryForm } from "./RecurrenceEntryForm";
import { SingleEntryForm } from "./SingleEntryForm";

type Tab = "single" | "installments" | "recurrence";

const TABS: { key: Tab; label: string }[] = [
  { key: "single", label: "Único" },
  { key: "installments", label: "Parcelado" },
  { key: "recurrence", label: "Recorrente" },
];

interface NewEntryModalProps {
  direction: EntryDirection;
  onClose: () => void;
}

export function NewEntryModal({ direction, onClose }: NewEntryModalProps) {
  const [tab, setTab] = useState<Tab>("single");

  return (
    <Modal title="Novo lançamento" onClose={onClose} width="lg">
      <div className="tabs">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? "active" : undefined}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "single" && <SingleEntryForm direction={direction} onSuccess={onClose} />}
      {tab === "installments" && <InstallmentsEntryForm direction={direction} onSuccess={onClose} />}
      {tab === "recurrence" && <RecurrenceEntryForm direction={direction} onSuccess={onClose} />}
    </Modal>
  );
}
