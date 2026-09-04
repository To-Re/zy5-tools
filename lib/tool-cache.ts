import type { CashFlowDirection, CompoundInput } from './compound';

export type ToolCurrency = 'CNY' | 'USD' | 'USDT';

export const COMPOUND_CACHE_KEY = 'zy5-tools-compound-v1';
export const JSON_VIEWER_CACHE_KEY = 'zy5-tools-json-viewer-v1';
export const JSON_VIEWER_CACHE_MAX_CHARS = 1_000_000;

const COMPOUND_FREQUENCIES = new Set([1, 2, 4, 12, 365]);
const MAX_CASH_FLOW_PLANS = 20;
const MAX_SCHEDULE_MONTHS = 2400;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isCurrency(value: unknown): value is ToolCurrency {
  return value === 'CNY' || value === 'USD' || value === 'USDT';
}

function parseCompoundInput(value: unknown): CompoundInput | null {
  if (!isRecord(value)) return null;
  if (!isFiniteNumber(value.principal) || value.principal < 0) return null;
  if (!isFiniteNumber(value.annualRatePct)) return null;
  if (!isIntegerInRange(value.years, 0, 200)) return null;
  if (!isIntegerInRange(value.months, 0, 11)) return null;
  if (!isIntegerInRange(value.days, 0, 364)) return null;
  if (!isFiniteNumber(value.compoundsPerYear) || !COMPOUND_FREQUENCIES.has(value.compoundsPerYear)) {
    return null;
  }
  if (!Array.isArray(value.cashFlows) || value.cashFlows.length > MAX_CASH_FLOW_PLANS) {
    return null;
  }

  const cashFlows = value.cashFlows.map((candidate, index) => {
    if (!isRecord(candidate)) return null;
    const direction = candidate.direction;
    if (direction !== 'deposit' && direction !== 'withdrawal') return null;
    if (!isFiniteNumber(candidate.amount) || candidate.amount < 0) return null;
    if (!isIntegerInRange(candidate.startMonth, 0, MAX_SCHEDULE_MONTHS)) return null;
    if (!isIntegerInRange(candidate.durationMonths, 1, MAX_SCHEDULE_MONTHS)) return null;
    if (!isIntegerInRange(candidate.intervalMonths, 1, MAX_SCHEDULE_MONTHS)) return null;

    return {
      id: `cached-cash-flow-${index + 1}`,
      direction: direction as CashFlowDirection,
      amount: candidate.amount,
      startMonth: candidate.startMonth,
      durationMonths: candidate.durationMonths,
      intervalMonths: candidate.intervalMonths,
    };
  });

  if (cashFlows.some((plan) => plan === null)) return null;

  return {
    principal: value.principal,
    annualRatePct: value.annualRatePct,
    years: value.years,
    months: value.months,
    days: value.days,
    compoundsPerYear: value.compoundsPerYear,
    cashFlows: cashFlows as CompoundInput['cashFlows'],
  };
}

export function parseCompoundCache(raw: string | null): {
  input: CompoundInput;
  currency: ToolCurrency;
} | null {
  if (raw === null) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !isCurrency(value.currency)) return null;
    const input = parseCompoundInput(value.input);
    return input ? { input, currency: value.currency } : null;
  } catch {
    return null;
  }
}

export function serializeCompoundCache(input: CompoundInput, currency: ToolCurrency): string {
  return JSON.stringify({
    version: 1,
    currency,
    input: {
      ...input,
      cashFlows: input.cashFlows.map((plan) => ({
        direction: plan.direction,
        amount: plan.amount,
        startMonth: plan.startMonth,
        durationMonths: plan.durationMonths,
        intervalMonths: plan.intervalMonths,
      })),
    },
  });
}

export function parseJsonViewerCache(raw: string | null): string | null {
  if (raw === null) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || typeof value.input !== 'string') return null;
    if (value.input.length > JSON_VIEWER_CACHE_MAX_CHARS) return null;
    return value.input;
  } catch {
    return null;
  }
}

export function serializeJsonViewerCache(input: string): string | null {
  if (input.length > JSON_VIEWER_CACHE_MAX_CHARS) return null;
  return JSON.stringify({ version: 1, input });
}
