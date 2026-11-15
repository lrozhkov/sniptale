import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { isEditorDocument } from '../editor/document/public';
import { EDITOR_HISTORY_OPERATIONS, type EditorHistoryAction } from './action';
import { IMAGE_EDITOR_HISTORY_LIMITS } from './policy';
import {
  decodeEditorImageHistorySnapshot,
  IMAGE_HISTORY_VALUE_TOKEN_PREFIX,
  IMAGE_HISTORY_VALUE_INLINE_LIMIT,
  type EditorImageHistoryValueKind,
} from './image-snapshot';

export interface EditorImageHistoryValue {
  id: string;
  kind: EditorImageHistoryValueKind;
  value: string;
}

/** Immutable runtime capture for the existing persistence adapter; binary values occur once. */
export interface EditorImageHistoryCheckpoint {
  version: 1;
  epoch: string;
  cursor: number;
  snapshots: readonly string[];
  values: readonly EditorImageHistoryValue[];
  actions: readonly (EditorHistoryAction | null)[];
}

interface AdmittedEditorImageHistory {
  checkpoint: EditorImageHistoryCheckpoint;
  /** Resource closures and lengths are disposable admission indexes, not stored trust evidence. */
  tokensBySnapshot: readonly ReadonlySet<string>[];
  bytesByToken: ReadonlyMap<string, number>;
}

function parseAction(value: unknown): EditorHistoryAction | null | undefined {
  if (value === null) return null;
  if (
    !isPlainRecord(value) ||
    Object.keys(value).some((key) => !['operation', 'target', 'color'].includes(key))
  )
    return undefined;
  const operation = EDITOR_HISTORY_OPERATIONS.find((operation) => operation === value['operation']);
  if (!operation) return undefined;
  let target: EditorHistoryAction['target'] = null;
  if (value['target'] !== null) {
    const raw = value['target'];
    if (
      !isPlainRecord(raw) ||
      Object.keys(raw).length !== 2 ||
      typeof raw['id'] !== 'string' ||
      !raw['id'].length ||
      !(raw['name'] === null || typeof raw['name'] === 'string')
    )
      return undefined;
    target = { id: raw['id'], name: raw['name'] };
  }
  const rawColor = value['color'];
  if (rawColor === undefined) return { operation, target };
  if (
    !isPlainRecord(rawColor) ||
    Object.keys(rawColor).length !== 2 ||
    !(rawColor['before'] === null || typeof rawColor['before'] === 'string') ||
    !(rawColor['after'] === null || typeof rawColor['after'] === 'string')
  )
    return undefined;
  return { operation, target, color: { before: rawColor['before'], after: rawColor['after'] } };
}

function parseValues(
  value: unknown
): { values: EditorImageHistoryValue[]; bytes: Map<string, number> } | null {
  if (!Array.isArray(value) || value.length > 100_000) return null;
  const values: EditorImageHistoryValue[] = [];
  const ids = new Set<string>();
  const contents = new Set<string>();
  const bytes = new Map<string, number>();
  const encoder = new TextEncoder();
  for (const raw of value) {
    if (
      !isPlainRecord(raw) ||
      Object.keys(raw).length !== 3 ||
      typeof raw['id'] !== 'string' ||
      !raw['id'].startsWith(IMAGE_HISTORY_VALUE_TOKEN_PREFIX) ||
      raw['id'].length <= IMAGE_HISTORY_VALUE_TOKEN_PREFIX.length ||
      raw['id'].length > 200 ||
      ids.has(raw['id']) ||
      typeof raw['value'] !== 'string' ||
      contents.has(raw['value']) ||
      (raw['kind'] !== 'image' && raw['kind'] !== 'json')
    )
      return null;
    if (
      raw['kind'] === 'image'
        ? !isImageDataUrl(raw['value'])
        : !isPlainRecord(JSON.parse(raw['value']) as unknown)
    )
      return null;
    ids.add(raw['id']);
    contents.add(raw['value']);
    bytes.set(raw['id'], encoder.encode(raw['value']).byteLength);
    values.push({ id: raw['id'], kind: raw['kind'], value: raw['value'] });
  }
  return { values, bytes };
}

/** Strictly admits a detached retained graph without materializing the same image per state. */
export function parseEditorImageHistoryCheckpoint(
  value: unknown,
  limits: Readonly<{ maxActions: number; maxBytes: number }> = IMAGE_EDITOR_HISTORY_LIMITS
): AdmittedEditorImageHistory | null {
  try {
    if (
      !isPlainRecord(value) ||
      Object.keys(value).some(
        (key) => !['version', 'epoch', 'cursor', 'snapshots', 'values', 'actions'].includes(key)
      ) ||
      value['version'] !== 1 ||
      typeof value['epoch'] !== 'string' ||
      !value['epoch'].length ||
      value['epoch'].length > 200 ||
      !Array.isArray(value['snapshots']) ||
      !value['snapshots'].length ||
      value['snapshots'].length > limits.maxActions + 1 ||
      !value['snapshots'].every(
        (snapshot: unknown): snapshot is string => typeof snapshot === 'string'
      ) ||
      typeof value['cursor'] !== 'number' ||
      !Number.isSafeInteger(value['cursor']) ||
      value['cursor'] < 0 ||
      value['cursor'] >= value['snapshots'].length ||
      !Array.isArray(value['actions']) ||
      value['actions'].length !== value['snapshots'].length
    )
      return null;
    const parsed = parseValues(value['values']);
    if (!parsed) return null;
    const actions: (EditorHistoryAction | null)[] = [];
    for (const [index, raw] of value['actions'].entries()) {
      const action = parseAction(raw);
      if (action === undefined || (index === 0 ? action !== null : action === null)) return null;
      actions.push(action);
    }
    const units = new Map(parsed.values.map((unit) => [unit.id, unit]));
    const tokensBySnapshot: Set<string>[] = [];
    const reachable = new Set<string>();
    const encoder = new TextEncoder();
    let metadataBytes = 0;
    let minimumBaseline = Number.POSITIVE_INFINITY;
    for (const snapshot of value['snapshots']) {
      const tokens = new Set<string>();
      const document = decodeEditorImageHistorySnapshot(
        snapshot,
        (token, kind) => {
          if (!token.startsWith(IMAGE_HISTORY_VALUE_TOKEN_PREFIX)) {
            if (
              (kind === 'image' && !isImageDataUrl(token)) ||
              token.length >= IMAGE_HISTORY_VALUE_INLINE_LIMIT
            )
              throw new Error('Image history resources must use canonical pooled values.');
            return undefined;
          }
          const unit = units.get(token);
          if (!unit || unit.kind !== kind)
            throw new Error('Invalid image history resource reference.');
          tokens.add(token);
          reachable.add(token);
          // Preserve the MIME contract (retained masks require PNG), after validating the real value once.
          return kind === 'image'
            ? `${unit.value.slice(0, unit.value.indexOf(',') + 1)}QUJDRA==`
            : unit.value;
        },
        {
          bounds: { maxDepth: 64, maxNodes: 100_000, maxObjectCharacters: 64 * 1024 * 1024 },
          requirePooledObjects: true,
        }
      );
      if (!isEditorDocument(document)) return null;
      const bytes = encoder.encode(snapshot).byteLength;
      metadataBytes += bytes;
      let baseline = bytes;
      for (const token of tokens) baseline += parsed.bytes.get(token)!;
      minimumBaseline = Math.min(minimumBaseline, baseline);
      tokensBySnapshot.push(tokens);
    }
    if (reachable.size !== parsed.values.length) return null;
    let total = metadataBytes;
    for (const token of reachable) total += parsed.bytes.get(token)!;
    if (total - minimumBaseline > limits.maxBytes) return null;
    return {
      checkpoint: {
        version: 1,
        epoch: value['epoch'],
        cursor: value['cursor'],
        snapshots: [...value['snapshots']],
        values: parsed.values,
        actions,
      },
      tokensBySnapshot,
      bytesByToken: parsed.bytes,
    };
  } catch {
    return null;
  }
}
