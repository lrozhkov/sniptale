import { hasExactKeys, isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  VIDEO_PROJECT_HISTORY_SOURCE_KINDS,
  type VideoProjectHistorySourceReference,
} from '../../../features/video/project/history-capture';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';

/** Native head references immutable inverse-change JSON; no project payload repeats in this head. */
export interface PersistedVideoProjectHistory {
  version: 1;
  epoch: string;
  past: readonly { assetId: string }[];
  future: readonly { assetId: string }[];
  /** Restore the anchor of past/future from an autosaved unfinished gesture. */
  recovery?: { assetId: string };
  sources: readonly VideoProjectHistorySourceReference[];
}

function parseChanges(value: unknown): { assetId: string }[] | null {
  if (!Array.isArray(value) || value.length > EDITOR_HISTORY_LIMITS.maxActions) return null;
  const result: { assetId: string }[] = [];
  for (const raw of value) {
    if (
      !isPlainRecord(raw) ||
      !hasExactKeys(raw, ['assetId']) ||
      typeof raw['assetId'] !== 'string' ||
      !raw['assetId'].length ||
      raw['assetId'].length > 256
    )
      return null;
    result.push({ assetId: raw['assetId'] });
  }
  return result;
}

/** The source index is native metadata; full hydration checks it against actual historical states. */
export function parsePersistedVideoProjectHistory(
  value: unknown
): PersistedVideoProjectHistory | null {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'version',
      'epoch',
      'past',
      'future',
      'sources',
      ...(value['recovery'] === undefined ? [] : ['recovery']),
    ]) ||
    value['version'] !== 1 ||
    typeof value['epoch'] !== 'string' ||
    !value['epoch'].length ||
    value['epoch'].length > 200 ||
    !Array.isArray(value['sources']) ||
    value['sources'].length > 100_000
  )
    return null;
  const past = parseChanges(value['past']);
  const future = parseChanges(value['future']);
  const recovery =
    value['recovery'] === undefined ? undefined : parseChanges([value['recovery']])?.[0];
  if (
    !past ||
    !future ||
    (value['recovery'] !== undefined && !recovery) ||
    past.length + future.length + (recovery ? 1 : 0) > EDITOR_HISTORY_LIMITS.maxActions
  )
    return null;
  const sources: VideoProjectHistorySourceReference[] = [];
  const seen = new Set<string>();
  let characters = 0;
  for (const raw of value['sources']) {
    if (
      !isPlainRecord(raw) ||
      !hasExactKeys(raw, ['kind', 'id']) ||
      typeof raw['id'] !== 'string' ||
      !raw['id'].length
    )
      return null;
    const kind = VIDEO_PROJECT_HISTORY_SOURCE_KINDS.find((kind) => kind === raw['kind']);
    if (!kind) return null;
    const key = JSON.stringify([kind, raw['id']]);
    characters += key.length;
    if (seen.has(key) || characters > EDITOR_HISTORY_LIMITS.maxBytes) return null;
    seen.add(key);
    sources.push({ kind, id: raw['id'] });
  }
  const history: PersistedVideoProjectHistory = {
    version: 1,
    epoch: value['epoch'],
    past,
    future,
    sources,
    ...(recovery ? { recovery } : {}),
  };
  return new TextEncoder().encode(JSON.stringify(history)).byteLength >
    EDITOR_HISTORY_LIMITS.maxBytes
    ? null
    : history;
}

/** One binding closure for writer ownership, native reads, transfer and reclamation. */
export function videoProjectHistoryAssetBindings(
  history: PersistedVideoProjectHistory | undefined | null
): { assetId: string; role: string }[] {
  if (!history) return [];
  return [...new Set(videoProjectHistoryChangeRefs(history).map((entry) => entry.assetId))].map(
    (assetId) => ({ assetId, role: `history:change:${assetId}` })
  );
}

/** Count logical references, including a recovery transition, before reading their shared files. */
export function videoProjectHistoryChangeRefs(
  history: PersistedVideoProjectHistory
): readonly { assetId: string }[] {
  return [...history.past, ...history.future, ...(history.recovery ? [history.recovery] : [])];
}
