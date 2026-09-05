import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  ReviewAnchor,
  ReviewAnnotation,
  ReviewEdit,
  ReviewOperation,
  ReviewRegion,
  ReviewSource,
} from './types';

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const time = (value: unknown, duration: number): value is number =>
  finite(value) && value >= 0 && value <= duration;
const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;

function isVideoMimeType(value: unknown): value is string {
  if (typeof value !== 'string' || value.includes('\r') || value.includes('\n')) return false;
  const separator = value.indexOf(';');
  const essence = separator < 0 ? value : value.slice(0, separator);
  return /^video\/[a-z0-9.+-]+$/i.test(essence);
}

/** Parses immutable media facts at the review boundary. */
export function parseReviewSource(value: unknown): ReviewSource | null {
  if (!isRecord(value)) return null;
  const { duration, width, height, mimeType, size } = value;
  if (
    !finite(duration) ||
    duration <= 0 ||
    !finite(width) ||
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    !finite(height) ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    !isVideoMimeType(mimeType) ||
    !finite(size) ||
    !Number.isSafeInteger(size) ||
    size <= 0
  )
    return null;
  return { duration, width, height, mimeType, size };
}

function parseAnchor(value: unknown, duration: number): ReviewAnchor | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'point' && time(value['time'], duration)) {
    return { kind: 'point', time: value['time'] };
  }
  if (
    value['kind'] === 'range' &&
    time(value['start'], duration) &&
    time(value['end'], duration) &&
    value['start'] < value['end']
  ) {
    return { kind: 'range', start: value['start'], end: value['end'] };
  }
  return null;
}

function parseRegion(value: unknown): ReviewRegion | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  if (
    !finite(x) ||
    !finite(y) ||
    !finite(width) ||
    !finite(height) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1 ||
    y + height > 1
  )
    return null;
  return { x, y, width, height };
}

/** Draft parsing permits empty text; committed comments require meaningful text. */
export function parseReviewAnnotation(
  value: unknown,
  duration: number,
  draft = false
): ReviewAnnotation | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    typeof value['text'] !== 'string' ||
    value['text'].length > 100_000 ||
    (!draft && !value['text'].trim())
  )
    return null;
  const anchor = parseAnchor(value['anchor'], duration);
  const region = value['region'] === undefined ? undefined : parseRegion(value['region']);
  if (!anchor || region === null || (region && anchor.kind !== 'point')) return null;
  let telemetryRef: ReviewAnnotation['telemetryRef'];
  if (value['telemetryRef'] !== undefined) {
    const ref = value['telemetryRef'];
    if (
      !isRecord(ref) ||
      !identity(ref['id']) ||
      (ref['kind'] !== 'action' && ref['kind'] !== 'signal' && ref['kind'] !== 'cursor')
    )
      return null;
    telemetryRef = { kind: ref['kind'], id: ref['id'] };
  }
  return {
    id: value['id'],
    text: value['text'],
    anchor,
    ...(region ? { region } : {}),
    ...(telemetryRef ? { telemetryRef } : {}),
  };
}

function parseEdit(value: unknown, duration: number): ReviewEdit | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    !time(value['start'], duration) ||
    !time(value['end'], duration) ||
    value['start'] >= value['end'] ||
    !time(value['requestedStart'], duration) ||
    !time(value['requestedEnd'], duration) ||
    value['requestedStart'] >= value['requestedEnd']
  )
    return null;
  const range = {
    id: value['id'],
    start: value['start'],
    end: value['end'],
    requestedStart: value['requestedStart'],
    requestedEnd: value['requestedEnd'],
  };
  if (value['kind'] === 'cut') return { ...range, kind: 'cut' };
  const rate = value['rate'];
  const audio = value['audio'];
  if (
    value['kind'] !== 'speed' ||
    (rate !== 1.25 && rate !== 1.5 && rate !== 2 && rate !== 4) ||
    (audio !== 'speed' && audio !== 'mute')
  )
    return null;
  return { ...range, kind: 'speed', rate, audio };
}

/** Parses both undo values, preserving no unvalidated extension properties. */
export function parseReviewOperation(value: unknown, duration: number): ReviewOperation | null {
  if (!isRecord(value) || !identity(value['id']) || !finite(value['at']) || value['at'] < 0)
    return null;
  const metadata = { id: value['id'], at: value['at'] };
  if (value['target'] === 'annotation') {
    const before =
      value['before'] === null ? null : parseReviewAnnotation(value['before'], duration);
    const after = value['after'] === null ? null : parseReviewAnnotation(value['after'], duration);
    if (
      (!before && value['before'] !== null) ||
      (!after && value['after'] !== null) ||
      (!before && !after)
    )
      return null;
    return { ...metadata, target: 'annotation', before, after };
  }
  if (value['target'] === 'edit') {
    const before = value['before'] === null ? null : parseEdit(value['before'], duration);
    const after = value['after'] === null ? null : parseEdit(value['after'], duration);
    if (
      (!before && value['before'] !== null) ||
      (!after && value['after'] !== null) ||
      (!before && !after)
    )
      return null;
    return { ...metadata, target: 'edit', before, after };
  }
  return null;
}
