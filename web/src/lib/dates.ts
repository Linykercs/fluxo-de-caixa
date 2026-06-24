// Subconjunto de server/src/lib/dates.ts usado no frontend (mesma convenção:
// "hoje" é o dia-calendário corrente em America/Sao_Paulo).
const TIMEZONE = "America/Sao_Paulo";

const spFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia-calendário corrente em America/Sao_Paulo, como "YYYY-MM-DD". */
export function todaySP(now: Date = new Date()): string {
  return spFormatter.format(now);
}

/** Mês corrente em America/Sao_Paulo, como "YYYY-MM". */
export function currentMonth(): string {
  return todaySP().slice(0, 7);
}

const COMPETENCE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidCompetenceMonth(value: string): boolean {
  return COMPETENCE_RE.test(value);
}

function parseCompetenceMonth(value: string): { year: number; month: number } {
  if (!isValidCompetenceMonth(value)) {
    throw new Error(`competenceMonth inválido: "${value}" (esperado "YYYY-MM")`);
  }
  const [year, month] = value.split("-").map(Number);
  return { year: year as number, month: month as number };
}

/** "2026-03" + 2 → "2026-05" (aceita offset negativo). */
export function addMonths(month: string, offset: number): string {
  const { year, month: m } = parseCompetenceMonth(month);
  const total = year * 12 + (m - 1) + offset;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const MONTH_NAMES_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-06" → "Junho 2026" */
export function formatMonthLong(month: string): string {
  const { year, month: m } = parseCompetenceMonth(month);
  const name = MONTH_NAMES[m - 1] as string;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/** "2026-06" → "jun" */
export function formatMonthShort(month: string): string {
  const { month: m } = parseCompetenceMonth(month);
  return MONTH_NAMES_SHORT[m - 1] as string;
}

/** "2031-04-15" → "15/04" */
export function formatDayMonth(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

/** "2031-04-15" → "15/04/2031" */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/** Último dia do mês ("2026-02" → 28). */
export function lastDayOfMonth(month: string): number {
  const { year, month: m } = parseCompetenceMonth(month);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** "2026-06" → "30/06" (último dia do mês, para a régua de saldos). */
export function lastDayLabel(month: string): string {
  const { month: m } = parseCompetenceMonth(month);
  return `${String(lastDayOfMonth(month)).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
