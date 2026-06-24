const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123456 (centavos) → "R$ 1.234,56" */
export function formatBRL(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

/** 123456 (centavos) → "1.234,56" (sem o símbolo, para uso em listas compactas) */
export function formatBRLNumber(cents: number): string {
  return numberFormatter.format(cents / 100);
}
