import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calendarDate, toDate } from "../src/lib/dates";
import { settleEntry } from "../src/services/settlements";
import {
  cancelRecurrence,
  createRecurrence,
  ensureHorizon,
  updateRecurrenceFromEntry,
} from "../src/services/recurrences";
import { createTestDb, makeFixture } from "./helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  db = await createTestDb();
  fx = await makeFixture(db.prisma);
});
afterAll(() => db.cleanup());

const TODAY = "2026-06-12";

function newRecurrence(overrides: Partial<Parameters<typeof createRecurrence>[1]> = {}) {
  return createRecurrence(db.prisma, {
    organizationId: fx.org.id,
    direction: "PAYABLE",
    description: "Assinatura",
    counterparty: "SaaS Ltda",
    categoryId: fx.expenseCat.id,
    amountCents: 10_000,
    dueDay: 10,
    startMonth: "2026-06",
    ...overrides,
  });
}

function entriesOf(recurrenceId: string) {
  return db.prisma.entry.findMany({
    where: { recurrenceId, deletedAt: null },
    orderBy: { competenceMonth: "asc" },
  });
}

describe("createRecurrence", () => {
  it("materializa 12 meses a partir do startMonth", async () => {
    const rec = await newRecurrence();
    const entries = await entriesOf(rec.id);
    expect(entries).toHaveLength(12);
    expect(entries[0]!.competenceMonth).toBe("2026-06");
    expect(entries[11]!.competenceMonth).toBe("2027-05");
    expect(rec.materializedUntil).toBe("2027-05");
  });

  it("respeita endMonth menor que o horizonte", async () => {
    const rec = await newRecurrence({ startMonth: "2026-06", endMonth: "2026-09" });
    expect(await entriesOf(rec.id)).toHaveLength(4);
  });

  it("dueDay 31 usa o último dia nos meses curtos", async () => {
    const rec = await newRecurrence({ dueDay: 31, startMonth: "2026-01", endMonth: "2026-04" });
    const entries = await entriesOf(rec.id);
    expect(entries.map((e) => calendarDate(e.dueDate))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });
});

describe("ensureHorizon", () => {
  it("completa o horizonte rolante e é idempotente", async () => {
    const rec = await newRecurrence({ startMonth: "2026-01" }); // materializa até 2026-12
    await ensureHorizon(db.prisma, fx.org.id, TODAY); // horizonte: 2027-05
    const after = await entriesOf(rec.id);
    expect(after[after.length - 1]!.competenceMonth).toBe("2027-05");
    expect(after).toHaveLength(17); // 2026-01..2027-05

    await ensureHorizon(db.prisma, fx.org.id, TODAY);
    expect(await entriesOf(rec.id)).toHaveLength(17); // nada duplicado
  });

  it("não recria ocorrência excluída dentro do horizonte", async () => {
    const rec = await newRecurrence({ startMonth: "2026-06" });
    const entries = await entriesOf(rec.id);
    await db.prisma.entry.update({
      where: { id: entries[3]!.id },
      data: { deletedAt: new Date() },
    });
    await ensureHorizon(db.prisma, fx.org.id, TODAY);
    expect(await entriesOf(rec.id)).toHaveLength(11);
  });

  it("não gera além do endMonth nem para canceladas", async () => {
    const ended = await newRecurrence({ startMonth: "2026-01", endMonth: "2026-03" });
    const canceled = await newRecurrence({ startMonth: "2026-06" });
    await cancelRecurrence(db.prisma, fx.org.id, canceled.id, TODAY);
    await ensureHorizon(db.prisma, fx.org.id, TODAY);
    expect(await entriesOf(ended.id)).toHaveLength(3);
  });
});

describe("updateRecurrenceFromEntry", () => {
  it("only_this desvincula a entry e muda só ela", async () => {
    const rec = await newRecurrence();
    const [first, second] = await entriesOf(rec.id);
    const updated = await updateRecurrenceFromEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: first!.id,
      scope: "only_this",
      changes: { amountCents: 99_000, description: "Assinatura com desconto" },
    });
    expect(updated.recurrenceId).toBeNull();
    expect(updated.amountCents).toBe(99_000);
    const untouched = await db.prisma.entry.findUnique({ where: { id: second!.id } });
    expect(untouched?.amountCents).toBe(10_000);
    // série segue com 11 vinculadas; a desvinculada não volta com ensureHorizon
    await ensureHorizon(db.prisma, fx.org.id, TODAY);
    expect(await entriesOf(rec.id)).toHaveLength(11);
  });

  it("this_and_future atualiza regra e ocorrências em aberto >= base; pagas ficam", async () => {
    const rec = await newRecurrence({ startMonth: "2026-06" });
    const entries = await entriesOf(rec.id);
    // paga a de agosto (índice 2)
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entries[2]!.id,
      amountCents: 10_000,
      settledAt: toDate("2026-08-10"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    await updateRecurrenceFromEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entries[1]!.id, // base: julho
      scope: "this_and_future",
      changes: { amountCents: 12_000, dueDay: 20 },
    });

    const after = await entriesOf(rec.id);
    expect(after[0]!.amountCents).toBe(10_000); // junho: antes da base
    expect(after[1]!.amountCents).toBe(12_000); // julho: atualizada
    expect(calendarDate(after[1]!.dueDate)).toBe("2026-07-20");
    expect(after[2]!.amountCents).toBe(10_000); // agosto: paga, intocada
    expect(calendarDate(after[2]!.dueDate)).toBe("2026-08-10");
    expect(after[3]!.amountCents).toBe(12_000); // setembro em diante: atualizadas
  });

  it("entry sem recorrência → ENTRY_NOT_RECURRENT", async () => {
    const single = await db.prisma.entry.create({
      data: {
        organizationId: fx.org.id,
        direction: "PAYABLE",
        description: "Avulsa",
        counterparty: "X",
        categoryId: fx.expenseCat.id,
        amountCents: 1_000,
        competenceMonth: "2026-06",
        dueDate: toDate("2026-06-20"),
      },
    });
    await expect(
      updateRecurrenceFromEntry(db.prisma, {
        organizationId: fx.org.id,
        entryId: single.id,
        scope: "only_this",
        changes: { description: "x" },
      }),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_RECURRENT" });
  });
});

describe("cancelRecurrence", () => {
  it("soft-deleta futuras em aberto; pagas permanecem; dupla falha", async () => {
    const rec = await newRecurrence({ startMonth: "2026-05" });
    const entries = await entriesOf(rec.id);
    // paga julho (futura) — deve permanecer mesmo após o cancelamento
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entries[2]!.id,
      amountCents: 10_000,
      settledAt: toDate("2026-06-01"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    await cancelRecurrence(db.prisma, fx.org.id, rec.id, TODAY);

    const remaining = await entriesOf(rec.id);
    // maio (passada, vencida) e junho (vence 10/06 < hoje? 10/06 já passou,
    // mas dueDate >= hoje é o filtro: 10/06 < 12/06 → permanece) e julho paga
    const months = remaining.map((e) => e.competenceMonth);
    expect(months).toContain("2026-05"); // vencida permanece (dívida real)
    expect(months).toContain("2026-06"); // já vencida também permanece
    expect(months).toContain("2026-07"); // paga permanece
    expect(months).not.toContain("2026-08"); // futura em aberto: excluída
    expect(months.length).toBe(3);

    await expect(cancelRecurrence(db.prisma, fx.org.id, rec.id, TODAY)).rejects.toMatchObject({
      code: "RECURRENCE_ALREADY_CANCELED",
    });
  });
});
