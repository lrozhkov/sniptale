import { isFreehandPointRecord, type FreehandPointRecord } from './points';

export interface FreehandStrokeSample extends FreehandPointRecord {
  t: number;
}

function isStrokeSample(value: unknown): value is FreehandStrokeSample {
  if (!isFreehandPointRecord(value)) {
    return false;
  }

  const candidate = value as FreehandPointRecord & { t?: unknown };
  return typeof candidate['t'] === 'number' && Number.isFinite(candidate['t']);
}

export function readFreehandSamplePoints(
  samples: readonly FreehandStrokeSample[]
): FreehandPointRecord[] {
  return samples.map(({ x, y }) => ({ x, y }));
}

export function normalizeFreehandStrokeSamples(samples: unknown): FreehandStrokeSample[] | null {
  if (!Array.isArray(samples)) {
    return null;
  }

  const normalized = samples
    .filter(isStrokeSample)
    .map((sample) => ({ t: sample.t, x: sample.x, y: sample.y }));
  return normalized.length > 0 ? normalized : null;
}

export function parseFreehandSamplesJson(value: unknown): FreehandStrokeSample[] | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return normalizeFreehandStrokeSamples(parsed);
  } catch {
    return null;
  }
}

export function serializeFreehandSamples(samples: readonly FreehandStrokeSample[]): string {
  return JSON.stringify(samples.map((sample) => ({ t: sample.t, x: sample.x, y: sample.y })));
}
