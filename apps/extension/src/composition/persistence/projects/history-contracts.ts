import { hasExactKeys, isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  VIDEO_PROJECT_HISTORY_SOURCE_KINDS,
  collectVideoProjectHistorySources,
  type VideoProjectHistorySourceReference,
} from '../../../features/video/project/history-capture';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import type { VideoProjectMetadata } from '../../../features/video/project/validation';
import type { VideoProject } from '../../../features/video/project/types';
import type { AssetRef } from '../assets/contracts';

/** Native ownership identity for immutable Montage inverse-change JSON. */
export const VIDEO_PROJECT_HISTORY_OWNER_KIND = 'video-project-history';
export const VIDEO_PROJECT_WORKSPACE_PUBLICATION_DOMAIN = 'video-project-workspace';

/** An owned attempt binds immutable resources to the predecessor observed before file IO. */
export interface PreparedVideoProjectWorkspaceWrite {
  project: VideoProject;
  history: PersistedVideoProjectHistory;
  refs: readonly AssetRef[];
  expectedProject: VideoProject | null;
  expectedWorkspaceRevision: number | null;
  expectedRetainedRevision: number;
}

/** Retained inverses or an unfinished gesture prevent independent current-head rewrites. */
export function hasVideoProjectHistoryChanges(
  history: PersistedVideoProjectHistory | undefined
): boolean {
  return Boolean(history && (history.past.length || history.future.length || history.recovery));
}

interface VideoProjectHistoryEnvelope {
  epoch: string;
  sources: readonly VideoProjectHistorySourceReference[];
}

/** Native JSON metadata stays in the head; legacy immutable-file envelopes remain readable. */
export type PersistedVideoProjectHistory = VideoProjectHistoryEnvelope &
  (
    | {
        version: 1;
        past: readonly { assetId: string }[];
        future: readonly { assetId: string }[];
        recovery?: { assetId: string };
      }
    | {
        version: 2;
        past: readonly { value: string }[];
        future: readonly { value: string }[];
        recovery?: { value: string };
      }
  );

function parseInlineChanges(value: unknown): { value: string }[] | null {
  if (!Array.isArray(value) || value.length > EDITOR_HISTORY_LIMITS.maxActions) return null;
  const result: { value: string }[] = [];
  for (const raw of value) {
    if (
      !isPlainRecord(raw) ||
      !hasExactKeys(raw, ['value']) ||
      typeof raw['value'] !== 'string' ||
      raw['value'].length > EDITOR_HISTORY_LIMITS.maxBytes
    )
      return null;
    result.push({ value: raw['value'] });
  }
  return result;
}

/** Counts every logical inline transition, including recovery and repeated values. */
export function videoProjectHistoryInlineBytes(history: PersistedVideoProjectHistory): number {
  if (history.version === 1) return 0;
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const entry of [
    ...history.past,
    ...history.future,
    ...(history.recovery ? [history.recovery] : []),
  ]) {
    bytes += encoder.encode(entry.value).byteLength;
    if (bytes > EDITOR_HISTORY_LIMITS.maxBytes) return bytes;
  }
  return bytes;
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
    (value['version'] !== 1 && value['version'] !== 2) ||
    typeof value['epoch'] !== 'string' ||
    !value['epoch'].length ||
    value['epoch'].length > 200 ||
    !Array.isArray(value['sources']) ||
    value['sources'].length > 100_000
  )
    return null;
  const parse = value['version'] === 1 ? parseChanges : parseInlineChanges;
  const past = parse(value['past']);
  const future = parse(value['future']);
  const recovery = value['recovery'] === undefined ? undefined : parse([value['recovery']])?.[0];
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
  if (value['version'] === 2) {
    const inlinePast = parseInlineChanges(value['past']);
    const inlineFuture = parseInlineChanges(value['future']);
    const inlineRecovery =
      value['recovery'] === undefined ? undefined : parseInlineChanges([value['recovery']])?.[0];
    if (!inlinePast || !inlineFuture) return null;
    const history: PersistedVideoProjectHistory = {
      version: 2,
      epoch: value['epoch'],
      past: inlinePast,
      future: inlineFuture,
      sources,
      ...(inlineRecovery ? { recovery: inlineRecovery } : {}),
    };
    return videoProjectHistoryInlineBytes(history) <= EDITOR_HISTORY_LIMITS.maxBytes
      ? history
      : null;
  }
  const filePast = parseChanges(value['past']);
  const fileFuture = parseChanges(value['future']);
  const fileRecovery =
    value['recovery'] === undefined ? undefined : parseChanges([value['recovery']])?.[0];
  if (!filePast || !fileFuture) return null;
  const history: PersistedVideoProjectHistory = {
    version: 1,
    epoch: value['epoch'],
    past: filePast,
    future: fileFuture,
    sources,
    ...(fileRecovery ? { recovery: fileRecovery } : {}),
  };
  return new TextEncoder().encode(JSON.stringify(history)).byteLength <=
    EDITOR_HISTORY_LIMITS.maxBytes
    ? history
    : null;
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
  return history.version === 1
    ? [...history.past, ...history.future, ...(history.recovery ? [history.recovery] : [])]
    : [];
}

/** Current and retained targets share one logical resource closure for native consumers. */
export function collectVideoProjectWorkspaceSources(entry: {
  project: VideoProjectMetadata;
  history?: PersistedVideoProjectHistory;
}): readonly VideoProjectHistorySourceReference[] {
  const sources = new Map<string, VideoProjectHistorySourceReference>();
  for (const source of [
    ...collectVideoProjectHistorySources(entry.project),
    ...(entry.history?.sources ?? []),
  ])
    sources.set(JSON.stringify([source.kind, source.id]), source);
  return [...sources.values()];
}
