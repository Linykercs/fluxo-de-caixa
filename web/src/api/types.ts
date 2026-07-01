export type UserRole = "ADMIN" | "OPERATOR";

export interface Me {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface UserSummary {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountSummary {
  id: string;
  organizationId: string;
  name: string;
  initialBalanceCents: number;
  balanceCents: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EntryDirection = "PAYABLE" | "RECEIVABLE";

export type EntryStatus = "OPEN" | "SETTLED" | "OVERDUE";

export interface Settlement {
  id: string;
  entryId: string;
  amountCents: number;
  settledAt: string;
  bankAccountId: string;
  userId: string;
  notes: string | null;
  reversalOfId: string | null;
  reversedById: string | null;
  createdAt: string;
}

export interface Entry {
  id: string;
  direction: EntryDirection;
  description: string;
  counterparty: string;
  counterpartyId: string | null;
  notes: string | null;
  categoryId: string;
  costCenterId: string | null;
  amountCents: number;
  competenceMonth: string;
  dueDate: string;
  recurrenceId: string | null;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  createdAt: string;
  updatedAt: string;
  settledCents: number;
  remainingCents: number;
  status: EntryStatus;
}

export interface EntryDetail extends Entry {
  settlements: Settlement[];
}

export type CategoryKind = "EXPENSE" | "INCOME";

export interface Category {
  id: string;
  organizationId: string;
  name: string;
  kind: CategoryKind;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CostCenter {
  id: string;
  organizationId: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Counterparty {
  id: string;
  organizationId: string;
  name: string;
  phoneNumber: string | null;
  telegramChatId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Recurrence {
  id: string;
  organizationId: string;
  direction: EntryDirection;
  description: string;
  counterparty: string;
  categoryId: string;
  amountCents: number;
  dueDay: number;
  startMonth: string;
  endMonth: string | null;
  materializedUntil: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEntry {
  id: string;
  direction: EntryDirection;
  description: string;
  counterparty: string;
  categoryId: string;
  dueDate: string;
  remainingCents: number;
}

export interface ProjectionMonth {
  month: string;
  payableCents: number;
  receivableCents: number;
  balanceCents: number;
}

export interface Dashboard {
  month: string;
  accounts: { id: string; name: string; balanceCents: number }[];
  totalBalanceCents: number;
  totals: {
    payable: { previstoCents: number; realizadoCents: number };
    receivable: { previstoCents: number; realizadoCents: number };
  };
  alerts: {
    overdue: AlertEntry[];
    dueToday: AlertEntry[];
    dueSoon: AlertEntry[];
  };
  projection: ProjectionMonth[];
}

export interface StatementLine {
  id: string;
  date: string;
  type: string;
  amountCents: number;
  description: string;
  balanceCents: number;
}

export interface Statement {
  accountId: string;
  accountName: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  lines: StatementLine[];
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  date: string;
  notes: string | null;
  createdAt: string;
}

export interface DirectionTotals {
  payableCents: number;
  receivableCents: number;
}

export interface MonthFlow {
  month: string;
  previsto: DirectionTotals;
  realizado: DirectionTotals;
}

export interface CategorySummaryRow {
  categoryId: string;
  categoryName: string;
  kind: CategoryKind;
  previstoCents: number;
  realizadoCents: number;
}

export interface CounterpartySummaryRow {
  counterparty: string;
  direction: EntryDirection;
  previstoCents: number;
  realizadoCents: number;
}

export interface Budget {
  id: string;
  categoryId: string;
  amountCents: number;
  startMonth: string;
  endMonth: string | null;
  category: { name: string; kind: CategoryKind };
}

export interface BudgetReportRow {
  categoryId: string;
  categoryName: string;
  kind: CategoryKind;
  budgetId: string | null;
  budgetedCents: number;
  actualCents: number;
}

export interface DreRow {
  categoryId: string;
  categoryName: string;
  amountCents: number;
}

export interface DreReport {
  month: string;
  receitas: DreRow[];
  despesas: DreRow[];
  totalReceitasCents: number;
  totalDespesasCents: number;
  resultadoCents: number;
  closedThroughMonth: string | null;
  isClosed: boolean;
}

export interface CostCenterDreRow {
  categoryId: string;
  categoryName: string;
  kind: CategoryKind;
  previstoCents: number;
  realizadoCents: number;
}

export interface CostCenterReport {
  costCenterId: string | null;
  costCenterName: string;
  totalReceitasPrevistoCents: number;
  totalReceitasRealizadoCents: number;
  totalDespesasPrevistoCents: number;
  totalDespesasRealizadoCents: number;
  resultadoPrevistoCents: number;
  resultadoRealizadoCents: number;
  receitas: CostCenterDreRow[];
  despesas: CostCenterDreRow[];
}

export interface ChartMonth {
  month: string;
  receitasCents: number;
  despesasCents: number;
  resultadoCents: number;
}

export interface ImportCandidate {
  entryId: string;
  description: string;
  counterparty: string;
  dueDate: string;
  remainingCents: number;
}

export type ImportRowStatus = "duplicate" | "matched" | "ambiguous" | "unmatched";

export interface ImportPreviewRow {
  fitid: string;
  date: string;
  amountCents: number;
  description: string;
  status: ImportRowStatus;
  candidates: ImportCandidate[];
}

export type ImportConfirmStatus = "settled" | "created" | "ignored" | "duplicate" | "error";

export interface ImportConfirmResult {
  fitid: string;
  status: ImportConfirmStatus;
  error?: { code: string; message: string };
}
