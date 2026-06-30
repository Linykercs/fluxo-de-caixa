import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toDate } from "../src/lib/dates";
import { createSingleEntry, deleteEntry } from "../src/services/entries";
import { runReminders } from "../src/services/reminders";
import { settleEntry } from "../src/services/settlements";
import { createTestDb, makeFixture } from "./helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  db = await createTestDb();
  fx = await makeFixture(db.prisma);
});
afterAll(() => db.cleanup());

let sentMessages: { chatId: string; text: string }[];

beforeEach(() => {
  sentMessages = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { chat_id: string; text: string };
      sentMessages.push({ chatId: body.chat_id, text: body.text });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function newEntry(dueDay: string, overrides: Partial<Parameters<typeof createSingleEntry>[1]> = {}) {
  return createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction: "PAYABLE",
    description: "Conta de luz",
    counterparty: "Energisa",
    categoryId: fx.expenseCat.id,
    amountCents: 10_000,
    dueDate: toDate(dueDay),
    ...overrides,
  });
}

describe("runReminders", () => {
  it("não envia nada se a organização não vinculou o Telegram", async () => {
    await newEntry("2026-01-01");
    const result = await runReminders(db.prisma, "2026-01-01");
    expect(result.messagesSent).toBe(0);
    expect(sentMessages).toHaveLength(0);
  });

  it("avisa lançamento que vence hoje", async () => {
    await db.prisma.organization.update({ where: { id: fx.org.id }, data: { telegramChatId: "111" } });
    const entry = await newEntry("2026-02-01");

    const result = await runReminders(db.prisma, "2026-02-01");

    expect(result.messagesSent).toBe(1);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.chatId).toBe("111");
    expect(sentMessages[0]!.text).toContain("Vencendo hoje");
    expect(sentMessages[0]!.text).toContain("Conta de luz");
    expect(sentMessages[0]!.text).toContain("100,00");

    const updated = await db.prisma.entry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updated.dueTodayNotifiedAt).not.toBeNull();
  });

  it("avisa lançamento que vence amanhã", async () => {
    await newEntry("2026-03-02");

    const result = await runReminders(db.prisma, "2026-03-01");

    expect(result.messagesSent).toBe(1);
    expect(sentMessages[0]!.text).toContain("Vencendo amanhã");
  });

  it("não duplica o aviso ao rodar de novo no mesmo dia", async () => {
    await newEntry("2026-04-01");

    await runReminders(db.prisma, "2026-04-01");
    expect(sentMessages).toHaveLength(1);

    sentMessages = [];
    const second = await runReminders(db.prisma, "2026-04-01");

    expect(second.messagesSent).toBe(0);
    expect(sentMessages).toHaveLength(0);
  });

  it("não avisa lançamento já liquidado", async () => {
    const entry = await newEntry("2026-05-01");
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entry.id,
      amountCents: 10_000,
      settledAt: toDate("2026-05-01"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    const result = await runReminders(db.prisma, "2026-05-01");

    expect(result.messagesSent).toBe(0);
    expect(sentMessages).toHaveLength(0);
  });

  it("não avisa lançamento excluído", async () => {
    const entry = await newEntry("2026-05-15");
    await deleteEntry(db.prisma, fx.org.id, entry.id);

    const result = await runReminders(db.prisma, "2026-05-15");

    expect(result.messagesSent).toBe(0);
    expect(sentMessages).toHaveLength(0);
  });
});
