import { describe, expect, it } from "vitest";
import {
  addMonths,
  calendarDate,
  competenceOf,
  dueDateInMonth,
  isOverdue,
  isValidCompetenceMonth,
  lastDayOfMonth,
  parseCompetenceMonth,
  spDayStart,
  toDate,
  todaySP,
} from "../src/lib/dates";

describe("todaySP", () => {
  it("usa o dia-calendário de São Paulo, não o de UTC", () => {
    // 02:00 UTC de 13/06 ainda é 23:00 de 12/06 em São Paulo (UTC-3)
    expect(todaySP(new Date("2026-06-13T02:00:00.000Z"))).toBe("2026-06-12");
    // 03:01 UTC já virou o dia em SP
    expect(todaySP(new Date("2026-06-13T03:01:00.000Z"))).toBe("2026-06-13");
  });
});

describe("spDayStart", () => {
  it("início do dia em SP (meia-noite local) é 03:00 UTC, não meia-noite UTC", () => {
    expect(spDayStart("2026-06-13")).toEqual(new Date("2026-06-13T03:00:00.000Z"));
  });
});

describe("isOverdue", () => {
  it("conta que vence hoje NÃO é vencida", () => {
    expect(isOverdue(toDate("2026-06-12"), "2026-06-12")).toBe(false);
  });
  it("venceu ontem é vencida", () => {
    expect(isOverdue(toDate("2026-06-11"), "2026-06-12")).toBe(true);
  });
  it("vence amanhã não é vencida", () => {
    expect(isOverdue(toDate("2026-06-13"), "2026-06-12")).toBe(false);
  });
});

describe("competenceMonth", () => {
  it("valida o formato YYYY-MM", () => {
    expect(isValidCompetenceMonth("2026-06")).toBe(true);
    expect(isValidCompetenceMonth("2026-13")).toBe(false);
    expect(isValidCompetenceMonth("2026-6")).toBe(false);
    expect(isValidCompetenceMonth("junho")).toBe(false);
  });
  it("parse e erro em formato inválido", () => {
    expect(parseCompetenceMonth("2026-06")).toEqual({ year: 2026, month: 6 });
    expect(() => parseCompetenceMonth("2026-00")).toThrow();
  });
});

describe("aritmética de meses", () => {
  it("addMonths atravessa o ano nos dois sentidos", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -2)).toBe("2025-11");
  });
  it("lastDayOfMonth conhece fevereiro e bissextos", () => {
    expect(lastDayOfMonth("2026-02")).toBe(28);
    expect(lastDayOfMonth("2028-02")).toBe(29);
    expect(lastDayOfMonth("2026-04")).toBe(30);
  });
  it("dueDateInMonth faz clamp em meses curtos", () => {
    expect(calendarDate(dueDateInMonth("2026-02", 31))).toBe("2026-02-28");
    expect(calendarDate(dueDateInMonth("2026-07", 31))).toBe("2026-07-31");
  });
  it("competenceOf extrai o mês da data", () => {
    expect(competenceOf(toDate("2026-06-12"))).toBe("2026-06");
  });
});
