import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { sameHistoryArray, sameHistoryRecord } from '@sniptale/foundation/history/equal';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import type { VideoProject } from '../../../features/video/project/types';

/** An inverse change belongs only to the admitted in-memory editor history that produced it. */
export type VideoProjectHistoryChange =
  | { kind: 'replace'; value: unknown }
  | { kind: 'remove' }
  | { kind: 'record'; fields: [string, VideoProjectHistoryChange][] }
  | { kind: 'items'; items: [number, VideoProjectHistoryChange][] }
  | { kind: 'splice'; start: number; deleteCount: number; values: unknown[] };

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return sameHistoryArray(left, right, sameValue);
  return isPlainRecord(left) && isPlainRecord(right) && sameHistoryRecord(left, right, sameValue);
}

function changedArray(left: unknown[], right: unknown[]): VideoProjectHistoryChange | null {
  if (left.length === right.length) {
    const items: [number, VideoProjectHistoryChange][] = [];
    for (let index = 0; index < left.length; index++) {
      const change = changedValue(left[index], right[index]);
      if (change) items.push([index, change]);
    }
    return items.length ? { kind: 'items', items } : null;
  }
  let start = 0;
  let tail = 0;
  const overlap = Math.min(left.length, right.length);
  while (start < overlap && sameValue(left[start], right[start])) start++;
  while (
    tail < overlap - start &&
    sameValue(left[left.length - 1 - tail], right[right.length - 1 - tail])
  )
    tail++;
  return {
    kind: 'splice',
    start,
    deleteCount: right.length - start - tail,
    values: left.slice(start, left.length - tail),
  };
}

function changedValue(left: unknown, right: unknown): VideoProjectHistoryChange | null {
  if (left === right) return null;
  if (Array.isArray(left) && Array.isArray(right)) return changedArray(left, right);
  if (!isPlainRecord(left) || !isPlainRecord(right)) return { kind: 'replace', value: left };
  const fields: [string, VideoProjectHistoryChange][] = [];
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const change = !Object.hasOwn(left, key)
      ? { kind: 'remove' as const }
      : !Object.hasOwn(right, key)
        ? { kind: 'replace' as const, value: left[key] }
        : changedValue(left[key], right[key]);
    if (change) fields.push([key, change]);
  }
  return fields.length ? { kind: 'record', fields } : null;
}

/** Derive inverse values; the history owner clones admitted changes and retains current facts separately. */
export function createVideoProjectHistoryChange(
  before: VideoProject,
  after: VideoProject
): VideoProjectHistoryChange | null {
  if (before.id !== after.id) throw new Error('History project changed.');
  const { updatedAt: _beforeTime, ...left } = before;
  const { updatedAt: _afterTime, ...right } = after;
  return changedValue(left, right);
}

function applyRecordFields(
  target: object,
  current: Record<string, unknown>,
  fields: [string, VideoProjectHistoryChange][]
): void {
  for (const [key, field] of fields) {
    if (field.kind === 'remove') Reflect.deleteProperty(target, key);
    else
      Object.defineProperty(target, key, {
        value: applyValue(current[key], field),
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
}

function applyValue(current: unknown, change: VideoProjectHistoryChange): unknown {
  if (change.kind === 'replace') return change.value;
  if (change.kind === 'remove') throw new Error('History removal needs a record field.');
  if (change.kind === 'record') {
    if (!isPlainRecord(current)) throw new Error('History record changed.');
    const next = { ...current };
    applyRecordFields(next, current, change.fields);
    return next;
  }
  if (!Array.isArray(current)) throw new Error('History array changed.');
  const values: unknown[] = current;
  if (change.kind === 'splice')
    return [
      ...values.slice(0, change.start),
      ...change.values,
      ...values.slice(change.start + change.deleteCount),
    ];
  const next = values.slice();
  for (const [index, item] of change.items) next[index] = applyValue(values[index], item);
  return next;
}

/** Restore an internal change derived from typed project roots; storage never supplies these changes. */
export function applyVideoProjectHistoryChange(
  current: VideoProject,
  change: VideoProjectHistoryChange
): VideoProject {
  if (change.kind !== 'record') throw new Error('History needs project fields.');
  const owned = structuredClone(change);
  const restored = { ...current };
  applyRecordFields(restored, { ...current }, owned.fields);
  if (restored.id !== current.id) throw new Error('History project is invalid.');
  return applyVideoProjectMutationPatch(restored, {});
}
