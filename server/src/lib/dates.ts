// Convenção de datas do sistema:
// - Datas-calendário (dueDate, settledAt) são armazenadas como DateTime em
//   meia-noite UTC e comparadas pelo dia-calendário ("YYYY-MM-DD").
// - "Hoje" é sempre o dia-calendário corrente em America/Sao_Paulo (spec §3.4):
//   às 23h de SP ainda é "hoje" mesmo que em UTC já seja o dia seguinte.
import { config } from "./config";

const spFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: config.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia-calendário corrente em America/Sao_Paulo, como "YYYY-MM-DD". */
export function todaySP(now: Date = new Date()): string {
  return spFormatter.format(now);
}

/** Dia-calendário de um DateTime armazenado em meia-noite UTC. */
export function calendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Constrói o DateTime canônico (meia-noite UTC) de um "YYYY-MM-DD". */
export function toDate(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00.000Z`);
}

/** Offset (ms) do fuso configurado em relação a UTC no instante informado. */
function tzOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - date.getTime();
}

/** Instante UTC em que começa o dia-calendário `isoDay` em America/Sao_Paulo (meia-noite local). */
export function spDayStart(isoDay: string): Date {
  const utcMidnight = toDate(isoDay);
  return new Date(utcMidnight.getTime() - tzOffsetMs(utcMidnight));
}

/** Vencida = dia do vencimento anterior a hoje (vencer hoje NÃO é vencida). */
export function isOverdue(dueDate: Date, today: string = todaySP()): boolean {
  return calendarDate(dueDate) < today;
}

const COMPETENCE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidCompetenceMonth(value: string): boolean {
  return COMPETENCE_RE.test(value);
}

export function parseCompetenceMonth(value: string): { year: number; month: number } {
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

/** Competência de uma data: "2026-06-12" → "2026-06". */
export function competenceOf(date: Date): string {
  return calendarDate(date).slice(0, 7);
}

/** Último dia do mês ("2026-02" → 28). */
export function lastDayOfMonth(month: string): number {
  const { year, month: m } = parseCompetenceMonth(month);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** Vencimento dentro do mês, com clamp para meses curtos (dia 31 → 28/fev). */
export function dueDateInMonth(month: string, dueDay: number): Date {
  const day = Math.min(dueDay, lastDayOfMonth(month));
  return toDate(`${month}-${String(day).padStart(2, "0")}`);
}

/** "2026-06-12" + 7 → "2026-06-19" (aceita offset negativo). */
export function addDays(isoDay: string, days: number): string {
  const date = toDate(isoDay);
  date.setUTCDate(date.getUTCDate() + days);
  return calendarDate(date);
}
