import { hasExactKeys, isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isHydratableVideoProjectMetadata, type VideoProjectMetadata } from './validation';
import {
  applyVideoProjectHistoryChangeValues,
  type VideoProjectHistoryChange,
} from './history-change';

/** Current metadata belongs to the native head; each direction stores only inverse values. */
interface VideoProjectHistoryCheckpoint {
  version: 1;
  projectId: string;
  past: readonly VideoProjectHistoryChange[];
  future: readonly VideoProjectHistoryChange[];
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const MAX_DEPTH = 64;
const MAX_NODES = 100_000;
interface DecodeBudget {
  nodes: number;
  characters: number;
  maxBytes: number;
}

function ownValue(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !('value' in descriptor)) throw new Error('History needs own data values.');
  return descriptor.value;
}

function cloneJson(value: unknown, budget: DecodeBudget, depth = 0): JsonValue {
  if (++budget.nodes > MAX_NODES || depth > MAX_DEPTH)
    throw new Error('History traversal limit exceeded.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    budget.characters += value.length;
    if (budget.characters > budget.maxBytes) throw new Error('History value limit exceeded.');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_NODES) throw new Error('History array limit exceeded.');
    return Array.from({ length: value.length }, (_, index) =>
      cloneJson(ownValue(value, String(index)), budget, depth + 1)
    );
  }
  if (!isPlainRecord(value)) throw new Error('History contains non-JSON data.');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error('History contains non-JSON objects.');
  const result: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(value)) {
    budget.characters += key.length;
    if (budget.characters > budget.maxBytes) throw new Error('History key limit exceeded.');
    Object.defineProperty(result, key, {
      value: cloneJson(ownValue(value, key), budget, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

function index(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseChange(value: unknown): VideoProjectHistoryChange {
  if (!isPlainRecord(value)) throw new Error('Invalid history change.');
  if (value['kind'] === 'replace' && hasExactKeys(value, ['kind', 'value']))
    return { kind: 'replace', value: value['value'] };
  if (value['kind'] === 'remove' && hasExactKeys(value, ['kind'])) return { kind: 'remove' };
  if (
    value['kind'] === 'record' &&
    hasExactKeys(value, ['kind', 'fields']) &&
    Array.isArray(value['fields']) &&
    value['fields'].length > 0
  ) {
    const fields: [string, VideoProjectHistoryChange][] = [];
    const seen = new Set<string>();
    for (const pair of value['fields']) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== 'string' ||
        seen.has(pair[0])
      )
        throw new Error('Invalid history fields.');
      seen.add(pair[0]);
      fields.push([pair[0], parseChange(pair[1])]);
    }
    return { kind: 'record', fields };
  }
  if (
    value['kind'] === 'items' &&
    hasExactKeys(value, ['kind', 'items']) &&
    Array.isArray(value['items']) &&
    value['items'].length > 0
  ) {
    const items: [number, VideoProjectHistoryChange][] = [];
    const seen = new Set<number>();
    for (const pair of value['items']) {
      if (!Array.isArray(pair) || pair.length !== 2 || !index(pair[0]) || seen.has(pair[0]))
        throw new Error('Invalid history indices.');
      seen.add(pair[0]);
      items.push([pair[0], parseChange(pair[1])]);
    }
    return { kind: 'items', items };
  }
  if (
    value['kind'] === 'splice' &&
    hasExactKeys(value, ['kind', 'start', 'deleteCount', 'values']) &&
    index(value['start']) &&
    index(value['deleteCount']) &&
    Array.isArray(value['values'])
  )
    return {
      kind: 'splice',
      start: value['start'],
      deleteCount: value['deleteCount'],
      values: value['values'],
    };
  throw new Error('Invalid history change shape.');
}

function parseDirection(value: unknown, maxActions: number): VideoProjectHistoryChange[] {
  if (!Array.isArray(value) || value.length > maxActions)
    throw new Error('History action limit exceeded.');
  return value.map((raw: unknown) => {
    const change = parseChange(raw);
    if (
      change.kind !== 'record' ||
      change.fields.some(([key]) => ['id', 'createdAt', 'updatedAt'].includes(key))
    )
      throw new Error('History cannot replace project identity or clocks.');
    return change;
  });
}

function validateDirection(
  current: VideoProjectMetadata,
  changes: readonly VideoProjectHistoryChange[]
) {
  let project = current;
  for (const change of changes) {
    project = applyVideoProjectHistoryChangeValues(project, change);
    if (!isHydratableVideoProjectMetadata(project)) throw new Error('Invalid historical project.');
  }
}

function freezeCheckpoint(checkpoint: VideoProjectHistoryCheckpoint): void {
  const pending: object[] = [checkpoint];
  while (pending.length) {
    const current = pending.pop()!;
    Object.freeze(current);
    const values: unknown[] = Object.values(current);
    for (const value of values)
      if (typeof value === 'object' && value !== null) pending.push(value);
  }
}

/** Admits detached metadata changes; native asset hydration and revision CAS remain persistence duties. */
export function parseVideoProjectHistoryCheckpoint(
  value: unknown,
  current: VideoProjectMetadata,
  limits: Readonly<{ maxActions: number; maxBytes: number }>
): VideoProjectHistoryCheckpoint | null {
  try {
    if (
      !isHydratableVideoProjectMetadata(current) ||
      !index(limits.maxActions) ||
      !index(limits.maxBytes)
    )
      return null;
    const owned = cloneJson(value, { nodes: 0, characters: 0, maxBytes: limits.maxBytes });
    if (
      !isPlainRecord(owned) ||
      !hasExactKeys(owned, ['version', 'projectId', 'past', 'future']) ||
      owned['version'] !== 1 ||
      owned['projectId'] !== current.id
    )
      return null;
    const past = parseDirection(owned['past'], limits.maxActions);
    const future = parseDirection(owned['future'], limits.maxActions);
    if (past.length + future.length > limits.maxActions) return null;
    const checkpoint: VideoProjectHistoryCheckpoint = {
      version: 1,
      projectId: current.id,
      past,
      future,
    };
    if (new TextEncoder().encode(JSON.stringify(checkpoint)).byteLength > limits.maxBytes)
      return null;
    validateDirection(current, [...past].reverse());
    validateDirection(current, future);
    freezeCheckpoint(checkpoint);
    return checkpoint;
  } catch {
    return null;
  }
}
