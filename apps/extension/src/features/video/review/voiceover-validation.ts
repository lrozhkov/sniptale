import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { QuickEditVoiceoverAnchor } from './advanced/types';
import type { ReviewTimeSegment } from './timeline';

const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 172800;
const equal = (left: number, right: number) => Math.abs(left - right) < 1e-7;

/** Validates complete, ordered audio coverage; hidden spans are never discarded on load. */
export function parseVoiceoverAnchors(
  value: unknown,
  start: number,
  duration: number
): QuickEditVoiceoverAnchor[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 20001) return null;
  const result: QuickEditVoiceoverAnchor[] = [];
  let offset = 0;
  let previousEnd = start;
  for (const raw of value) {
    if (
      !isRecord(raw) ||
      !number(raw['start']) ||
      !number(raw['end']) ||
      !number(raw['offset']) ||
      !number(raw['duration'])
    )
      return null;
    if (
      raw['start'] < previousEnd ||
      raw['end'] <= raw['start'] ||
      raw['duration'] <= 0 ||
      !equal(raw['offset'], offset)
    )
      return null;
    result.push({
      start: raw['start'],
      end: raw['end'],
      offset: raw['offset'],
      duration: raw['duration'],
    });
    previousEnd = raw['end'];
    offset += raw['duration'];
  }
  return equal(result[0]!.start, start) && equal(offset, duration) ? result : null;
}

/** Accepts only contiguous time-map segments with a consistent source/result rate. */
export function parseVoiceoverSegments(value: unknown): ReviewTimeSegment[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 20001) return null;
  const result: ReviewTimeSegment[] = [];
  let sourceEnd = 0;
  let resultEnd = 0;
  for (const raw of value) {
    if (
      !isRecord(raw) ||
      !number(raw['sourceStart']) ||
      !number(raw['sourceEnd']) ||
      !number(raw['resultStart']) ||
      !number(raw['resultEnd']) ||
      !number(raw['rate'])
    )
      return null;
    const kind = raw['kind'];
    if (kind !== 'cut' && kind !== 'speed' && kind !== 'keep') return null;
    if (
      raw['sourceStart'] !== sourceEnd ||
      raw['resultStart'] !== resultEnd ||
      raw['sourceEnd'] <= sourceEnd ||
      raw['rate'] <= 0 ||
      (kind !== 'speed' && raw['rate'] !== 1)
    )
      return null;
    const expected =
      resultEnd + (kind === 'cut' ? 0 : (raw['sourceEnd'] - sourceEnd) / raw['rate']);
    if (!equal(raw['resultEnd'], expected)) return null;
    result.push({
      sourceStart: sourceEnd,
      sourceEnd: raw['sourceEnd'],
      resultStart: resultEnd,
      resultEnd: raw['resultEnd'],
      rate: raw['rate'],
      kind,
    });
    sourceEnd = raw['sourceEnd'];
    resultEnd = raw['resultEnd'];
  }
  return result;
}
