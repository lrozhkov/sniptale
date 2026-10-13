import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  CursorFocusBinding,
  CursorFocusKey,
  CursorFocusPath,
  CursorFocusPoint,
  CursorFocusSegment,
} from './types';

const identity = (value: unknown, max = 256): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
const number = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
function point(value: unknown, controls = false): CursorFocusPoint | null {
  return isRecord(value) &&
    number(value['x'], controls ? -4 : 0, controls ? 5 : 1) &&
    number(value['y'], controls ? -4 : 0, controls ? 5 : 1)
    ? { x: value['x'], y: value['y'] }
    : null;
}
function binding(value: unknown): CursorFocusBinding | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'project') return { kind: 'project' };
  return value['kind'] === 'recording-source' &&
    identity(value['recordingId']) &&
    identity(value['sourceInstanceId'])
    ? {
        kind: 'recording-source',
        recordingId: value['recordingId'],
        sourceInstanceId: value['sourceInstanceId'],
      }
    : null;
}
function key(value: unknown): CursorFocusKey | null {
  if (
    !isRecord(value) ||
    !identity(value['id'], 1024) ||
    !number(value['time'], 0, 86400) ||
    (value['authored'] !== undefined && value['authored'] !== true)
  )
    return null;
  const position = point(value);
  const anchor = value['anchor'];
  const interpolation = value['interpolation'];
  const incoming = value['incoming'] === undefined ? undefined : point(value['incoming'], true);
  const outgoing = value['outgoing'] === undefined ? undefined : point(value['outgoing'], true);
  if (
    !position ||
    incoming === null ||
    outgoing === null ||
    (anchor !== 'manual' &&
      anchor !== 'movement' &&
      anchor !== 'click' &&
      anchor !== 'dwell' &&
      anchor !== 'boundary') ||
    (interpolation !== 'linear' && interpolation !== 'smooth' && interpolation !== 'hold')
  )
    return null;
  return {
    ...(value['authored'] === true ? { authored: true } : {}),
    id: value['id'],
    time: value['time'],
    ...position,
    anchor,
    interpolation,
    ...(incoming ? { incoming } : {}),
    ...(outgoing ? { outgoing } : {}),
  };
}

/** Bounded receiving parser; malformed authored content refuses without changing source facts. */
export function parseCursorFocusPath(value: unknown): CursorFocusPath | null {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    !number(value['smoothing'], 0, 1) ||
    !number(value['sensitivity'], 0, 1) ||
    (value['mode'] !== 'fixed' && value['mode'] !== 'follow') ||
    value['gapPolicy'] !== 'hold' ||
    !Array.isArray(value['segments']) ||
    value['segments'].length > 5000
  )
    return null;
  const segments: CursorFocusSegment[] = [];
  const ids = new Set<string>();
  let keyCount = 0;
  for (const entry of value['segments']) {
    if (
      !isRecord(entry) ||
      !identity(entry['id'], 1024) ||
      ids.has(entry['id']) ||
      !number(entry['start'], 0, 86400) ||
      !number(entry['end'], entry['start'], 86400) ||
      !Array.isArray(entry['keys']) ||
      !entry['keys'].length ||
      (keyCount += entry['keys'].length) > 5000
    )
      return null;
    ids.add(entry['id']);
    const source = binding(entry['binding']);
    if (!source) return null;
    const keys: CursorFocusKey[] = [];
    for (const item of entry['keys']) {
      const parsed = key(item);
      if (
        !parsed ||
        ids.has(parsed.id) ||
        parsed.time < entry['start'] ||
        parsed.time > entry['end'] ||
        (keys.at(-1)?.time ?? 0) > parsed.time
      )
        return null;
      ids.add(parsed.id);
      keys.push(parsed);
    }
    segments.push({
      id: entry['id'],
      binding: source,
      start: entry['start'],
      end: entry['end'],
      keys,
    });
  }
  return {
    version: 1,
    smoothing: value['smoothing'],
    sensitivity: value['sensitivity'],
    mode: value['mode'],
    gapPolicy: 'hold',
    segments,
  };
}
