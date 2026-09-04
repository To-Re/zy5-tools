export const AHR999_API_URL =
  'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000';
export const AHR999_CACHE_KEY = 'zy5-tools-ahr999-v1';
export const AHR999_CACHE_TTL_MS = 15 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const BITCOIN_GENESIS_TIME = Date.UTC(2009, 0, 3);
const DEFAULT_WINDOW_SIZE = 200;

export interface BitcoinDailyClose {
  openTime: number;
  closeTime: number;
  date: string;
  close: number;
}

export interface Ahr999Point extends BitcoinDailyClose {
  dcaCost: number;
  fittedPrice: number;
  ahr999: number;
}

export type Ahr999Zone = 'bottom' | 'dca' | 'wait' | 'high';

export interface Ahr999Cache {
  fetchedAt: number;
  points: Ahr999Point[];
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function parseBinanceDailyKlines(payload: unknown): BitcoinDailyClose[] {
  if (!Array.isArray(payload)) throw new Error('Binance 日线格式无效。');

  const deduplicated = new Map<number, BitcoinDailyClose>();
  payload.slice(-1500).forEach((row) => {
    if (!Array.isArray(row) || row.length < 7) throw new Error('Binance 日线字段不完整。');
    const openTime = Number(row[0]);
    const close = Number(row[4]);
    const closeTime = Number(row[6]);
    if (!isFinitePositive(openTime) || !isFinitePositive(closeTime) || !isFinitePositive(close)) {
      throw new Error('Binance 日线包含无效数值。');
    }
    deduplicated.set(openTime, {
      openTime,
      closeTime,
      date: new Date(openTime).toISOString().slice(0, 10),
      close,
    });
  });

  return [...deduplicated.values()].sort((left, right) => left.openTime - right.openTime);
}

export function calculateAhr999Series(
  closes: readonly BitcoinDailyClose[],
  windowSize = DEFAULT_WINDOW_SIZE,
): Ahr999Point[] {
  if (!Number.isInteger(windowSize) || windowSize < 2) {
    throw new Error('定投成本窗口无效。');
  }
  if (closes.length < windowSize) {
    throw new Error(`至少需要 ${windowSize} 根已收盘日线。`);
  }

  let rollingLogSum = 0;
  const points: Ahr999Point[] = [];

  closes.forEach((item, index) => {
    if (!isFinitePositive(item.close) || !isFinitePositive(item.openTime)) {
      throw new Error('BTC 日线包含无效价格。');
    }
    rollingLogSum += Math.log(item.close);
    if (index >= windowSize) rollingLogSum -= Math.log(closes[index - windowSize].close);
    if (index < windowSize - 1) return;

    const dcaCost = Math.exp(rollingLogSum / windowSize);
    const ageDays = Math.max(1, Math.floor((item.openTime - BITCOIN_GENESIS_TIME) / DAY_MS));
    const fittedPrice = 10 ** (5.84 * Math.log10(ageDays) - 17.01);
    const ahr999 = (item.close / dcaCost) * (item.close / fittedPrice);
    if (![dcaCost, fittedPrice, ahr999].every(Number.isFinite)) {
      throw new Error('AHR999 计算结果超出范围。');
    }
    points.push({ ...item, dcaCost, fittedPrice, ahr999 });
  });

  return points;
}

export function getAhr999Zone(value: number): Ahr999Zone {
  if (value < 0.45) return 'bottom';
  if (value < 1.2) return 'dca';
  if (value < 5) return 'wait';
  return 'high';
}

export function getAhr999ZoneLabel(value: number) {
  const labels: Record<Ahr999Zone, string> = {
    bottom: '抄底区',
    dca: '定投区',
    wait: '等待区',
    high: '高位区',
  };
  return labels[getAhr999Zone(value)];
}

function isAhr999Point(value: unknown): value is Ahr999Point {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const point = value as Partial<Ahr999Point>;
  return (
    isFinitePositive(point.openTime) &&
    isFinitePositive(point.closeTime) &&
    typeof point.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
    isFinitePositive(point.close) &&
    isFinitePositive(point.dcaCost) &&
    isFinitePositive(point.fittedPrice) &&
    isFinitePositive(point.ahr999)
  );
}

export function parseAhr999Cache(raw: string | null): Ahr999Cache | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as { version?: unknown; fetchedAt?: unknown; points?: unknown };
    if (candidate.version !== 1 || !isFinitePositive(candidate.fetchedAt)) return null;
    if (!Array.isArray(candidate.points) || candidate.points.length === 0 || candidate.points.length > 1500) {
      return null;
    }
    if (!candidate.points.every(isAhr999Point)) return null;
    return {
      fetchedAt: candidate.fetchedAt,
      points: candidate.points.map((point) => ({ ...point })),
    };
  } catch {
    return null;
  }
}

export function serializeAhr999Cache(points: readonly Ahr999Point[], fetchedAt: number): string {
  return JSON.stringify({ version: 1, fetchedAt, points });
}
