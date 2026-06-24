// Parser OFX 1.x (SGML): tags sem fechamento obrigatório, então cada
// <STMTTRN> é extraído por bloco e os campos por regex linha-a-linha.
export interface OfxTransaction {
  fitid: string;
  date: string; // YYYY-MM-DD
  amountCents: number; // com sinal (negativo = saída)
  description: string;
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([^<\r\n]*)`, "i"));
  return match ? match[1]!.trim() : null;
}

function parseAmountCents(raw: string): number {
  return Math.round(parseFloat(raw.replace(",", ".")) * 100);
}

function parseOfxDate(raw: string): string {
  const digits = raw.slice(0, 8);
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function parseOfx(content: string): OfxTransaction[] {
  const transactions: OfxTransaction[] = [];
  for (const match of content.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)) {
    const block = match[1]!;
    const fitid = extractTag(block, "FITID");
    const dtposted = extractTag(block, "DTPOSTED");
    const trnamt = extractTag(block, "TRNAMT");
    if (!fitid || !dtposted || !trnamt) continue;

    const description = extractTag(block, "NAME") ?? extractTag(block, "MEMO") ?? "";
    transactions.push({
      fitid,
      date: parseOfxDate(dtposted),
      amountCents: parseAmountCents(trnamt),
      description,
    });
  }
  return transactions;
}
