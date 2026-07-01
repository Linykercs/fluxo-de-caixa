import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toDate } from "../src/lib/dates";
import { runCollections } from "../src/services/collections";
import { createSingleEntry } from "../src/services/entries";
import { settleEntry } from "../src/services/settlements";
import { createTestDb, makeFixture } from "./helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  db = await createTestDb();
  fx = await makeFixture(db.prisma);
});
afterAll(() => db.cleanup());

const sendWhatsAppMessage = vi.fn();
vi.mock("../src/services/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessage(...args),
}));

let sentTelegram: { chatId: string; text: string }[];

beforeEach(() => {
  sentTelegram = [];
  sendWhatsAppMessage.mockReset();
  sendWhatsAppMessage.mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { chat_id: string; text: string };
      sentTelegram.push({ chatId: body.chat_id, text: body.text });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

async function newCounterparty(overrides: Partial<{ telegramChatId: string; phoneNumber: string }> = {}) {
  return db.prisma.counterparty.create({
    data: { organizationId: fx.org.id, name: "Cliente Teste", ...overrides },
  });
}

function newReceivable(dueDay: string, counterpartyId: string, overrides: { amountCents?: number } = {}) {
  return createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction: "RECEIVABLE",
    description: "Mensalidade",
    counterparty: "Cliente Teste",
    counterpartyId,
    categoryId: fx.incomeCat.id,
    amountCents: overrides.amountCents ?? 10_000,
    dueDate: toDate(dueDay),
  });
}

describe("runCollections", () => {
  it("não cobra lançamento que ainda não venceu", async () => {
    // due date bem no futuro: nenhum outro teste deste arquivo passa perto
    // desse "today", senão o lançamento (nunca marcado collectionSentAt
    // porque não estava vencido aqui) seria pego numa rodada posterior.
    const cp = await newCounterparty({ telegramChatId: "111" });
    await newReceivable("2030-01-10", cp.id);

    const result = await runCollections(db.prisma, "2027-01-05");

    expect(result.messagesSent).toBe(0);
    expect(sentTelegram).toHaveLength(0);
  });

  it("cobra lançamento vencido com cliente vinculado ao Telegram", async () => {
    const cp = await newCounterparty({ telegramChatId: "222" });
    const entry = await newReceivable("2027-02-01", cp.id, { amountCents: 15_000 });

    const result = await runCollections(db.prisma, "2027-02-10");

    expect(result.messagesSent).toBe(1);
    expect(sentTelegram).toHaveLength(1);
    expect(sentTelegram[0]!.chatId).toBe("222");
    expect(sentTelegram[0]!.text).toContain("Mensalidade");
    expect(sentTelegram[0]!.text).toContain("150,00");

    const updated = await db.prisma.entry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updated.collectionSentAt).not.toBeNull();
  });

  it("cobra por WhatsApp quando o cliente só tem telefone", async () => {
    const cp = await newCounterparty({ phoneNumber: "5511999998888" });
    await newReceivable("2027-03-01", cp.id);

    const result = await runCollections(db.prisma, "2027-03-10");

    expect(result.messagesSent).toBe(1);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppMessage).toHaveBeenCalledWith("5511999998888", expect.stringContaining("Mensalidade"));
  });

  it("agrupa vários lançamentos vencidos do mesmo cliente numa única mensagem", async () => {
    const cp = await newCounterparty({ telegramChatId: "333" });
    await newReceivable("2027-04-01", cp.id, { amountCents: 10_000 });
    await newReceivable("2027-04-05", cp.id, { amountCents: 20_000 });

    const result = await runCollections(db.prisma, "2027-04-10");

    expect(result.messagesSent).toBe(1);
    expect(sentTelegram).toHaveLength(1);
    expect(sentTelegram[0]!.text).toContain("300,00"); // total
  });

  it("não cobra lançamento já liquidado", async () => {
    const cp = await newCounterparty({ telegramChatId: "444" });
    const entry = await newReceivable("2027-05-01", cp.id, { amountCents: 10_000 });
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entry.id,
      amountCents: 10_000,
      settledAt: toDate("2027-05-01"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    const result = await runCollections(db.prisma, "2027-05-10");

    expect(result.messagesSent).toBe(0);
    expect(sentTelegram).toHaveLength(0);
  });

  it("não cobra de novo o mesmo lançamento numa segunda rodada", async () => {
    const cp = await newCounterparty({ telegramChatId: "555" });
    await newReceivable("2027-06-01", cp.id);

    await runCollections(db.prisma, "2027-06-10");
    expect(sentTelegram).toHaveLength(1);

    sentTelegram = [];
    const second = await runCollections(db.prisma, "2027-06-15");

    expect(second.messagesSent).toBe(0);
    expect(sentTelegram).toHaveLength(0);
  });

  it("não cobra cliente sem nenhum canal configurado", async () => {
    const cp = await newCounterparty();
    await newReceivable("2027-07-01", cp.id);

    const result = await runCollections(db.prisma, "2027-07-10");

    expect(result.messagesSent).toBe(0);
  });

  it("não cobra lançamento sem cliente vinculado", async () => {
    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "RECEIVABLE",
      description: "Sem cliente",
      counterparty: "Alguém",
      categoryId: fx.incomeCat.id,
      amountCents: 5_000,
      dueDate: toDate("2027-08-01"),
    });

    const result = await runCollections(db.prisma, "2027-08-10");

    expect(result.messagesSent).toBe(0);
  });
});
