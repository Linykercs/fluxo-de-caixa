import type { ChangeEvent } from "react";
import { formatBRL } from "../lib/money";

interface CurrencyInputProps {
  id?: string;
  name?: string;
  valueCents: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
  required?: boolean;
}

/** Input que converte dígitos digitados diretamente em centavos (ex.: "123456" → R$ 1.234,56). */
export function CurrencyInput({ id, name, valueCents, onChange, disabled, required }: CurrencyInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "");
    onChange(digits === "" ? 0 : Number(digits));
  }

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      value={formatBRL(valueCents)}
      onChange={handleChange}
      disabled={disabled}
      required={required}
    />
  );
}
