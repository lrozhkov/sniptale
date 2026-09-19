import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { QuickEditAdvancedContent } from '../../../features/video/review/advanced/types';
import type { VideoWorkspace, VideoWorkspaceSnapshot } from './contracts';

const AUDIO_PREFIX = 'project-asset:';
const LANES = ['voiceover', 'music'] as const;
/** Portable metadata forbids local asset keys; review lane refs travel renamed. */
const PORTABLE_REF_KEY = 'assetRef';

/** Walks every history `advancedContent` operation payload once per transform. */
function mapHistoryAudio(
  value: unknown,
  transform: (audio: Record<string, unknown>) => Record<string, unknown>
): unknown {
  if (!isRecord(value) || !Array.isArray(value['history']) || !value['history'].length)
    return value;
  const history = (value['history'] as unknown[]).map((operation) => {
    if (!isRecord(operation) || operation['target'] !== 'advancedContent') return operation;
    const mapPayload = (payload: unknown) => {
      if (!isRecord(payload) || !isRecord(payload['audio'])) return payload;
      return { ...payload, audio: transform(payload['audio']) };
    };
    return {
      ...operation,
      ...(operation['before'] === undefined ? {} : { before: mapPayload(operation['before']) }),
      ...(operation['after'] === undefined ? {} : { after: mapPayload(operation['after']) }),
    };
  });
  return { ...value, history };
}

/** Renames the lane clip asset keys so archive metadata stays portable-safe. */
export function encodePortableReviewAssetRefs<T>(review: T): T {
  if (
    !isRecord(review) ||
    !isRecord(review['workspace']) ||
    !isRecord(review['workspace']['advanced'])
  )
    return review;
  const advanced = review['workspace']['advanced'] as Record<string, unknown>;
  const audio = advanced['audio'];
  if (!isRecord(audio)) return review;
  return {
    ...review,
    workspace: {
      ...review['workspace'],
      advanced: {
        ...advanced,
        audio: renameLaneRef(audio, 'assetId', PORTABLE_REF_KEY),
      },
      history: (
        mapHistoryAudio(review['workspace'], (laneAudio) =>
          renameLaneRef(laneAudio, 'assetId', PORTABLE_REF_KEY)
        ) as { history: VideoWorkspace['history'] }
      ).history,
    },
  } as T;
}

/** Restores the runtime lane clip shape from its portable encoding. */
export function decodePortableReviewAssetRefs<T>(workspace: T): T {
  if (!isRecord(workspace) || !isRecord(workspace['advanced'])) return workspace;
  const advanced = workspace['advanced'] as Record<string, unknown>;
  const audio = advanced['audio'];
  if (!isRecord(audio)) return workspace;
  return {
    ...workspace,
    advanced: {
      ...advanced,
      audio: renameLaneRef(audio, PORTABLE_REF_KEY, 'assetId'),
    },
    history: (
      mapHistoryAudio(workspace, (laneAudio) =>
        renameLaneRef(laneAudio, PORTABLE_REF_KEY, 'assetId')
      ) as { history: unknown }
    ).history as typeof workspace.history,
  } as T;
}

function renameLaneRef(
  audio: Record<string, unknown>,
  sourceKey: string,
  targetKey: string
): Record<string, unknown> {
  const next = { ...audio };
  for (const lane of LANES) {
    const clips = audio[lane];
    if (!Array.isArray(clips)) continue;
    next[lane] = clips.map((clip: unknown) => {
      if (!isRecord(clip)) return clip;
      const reference = clip[sourceKey];
      if (typeof reference !== 'string') return clip;
      const { [sourceKey]: _renamed, ...rest } = clip;
      return { ...rest, [targetKey]: reference };
    });
  }
  return next;
}

/** Asset id maps are keyed by the bare stored entry id; refs keep their prefix. */
function lookupAssetId(
  assetIdMap: ReadonlyMap<string, string>,
  reference: string
): string | undefined {
  if (!reference.startsWith(AUDIO_PREFIX)) return undefined;
  const bare = reference.slice(AUDIO_PREFIX.length);
  const mapped = assetIdMap.get(reference) ?? assetIdMap.get(bare);
  if (mapped === undefined) return undefined;
  return mapped.startsWith(AUDIO_PREFIX) ? mapped : AUDIO_PREFIX + mapped;
}

/** Collects every project-asset reference the review keeps, including history ops. */
export function collectReviewAssetReferences(
  workspace: Pick<VideoWorkspace, 'advanced' | 'history'>
): ReadonlySet<string> {
  const references = new Set<string>();
  const advanced = workspace.advanced;
  collectContentReferences(advanced, references);
  if (advanced.recoveryV1) collectRecoveryReferences(advanced.recoveryV1, references);
  for (const operation of workspace.history ?? []) {
    if (operation.target !== 'advancedContent') continue;
    collectContentReferences(operation.before, references);
    collectContentReferences(operation.after, references);
  }
  return references;
}

function collectContentReferences(
  content: Pick<QuickEditAdvancedContent, 'audio'>,
  into: Set<string>
): void {
  for (const lane of LANES) {
    for (const clip of content.audio[lane]) {
      if (clip.assetId.startsWith(AUDIO_PREFIX)) into.add(clip.assetId);
    }
  }
}

function collectRecoveryReferences(recoveryV1: string, into: Set<string>): void {
  try {
    const parsed: unknown = JSON.parse(recoveryV1);
    if (!isRecord(parsed) || !isRecord(parsed['audio'])) return;
    const recoveryAudio = parsed['audio'];
    for (const lane of LANES) {
      const clips = recoveryAudio[lane];
      if (!Array.isArray(clips)) continue;
      for (const clip of clips) {
        if (
          isRecord(clip) &&
          typeof clip['assetId'] === 'string' &&
          clip['assetId'].startsWith(AUDIO_PREFIX)
        )
          into.add(clip['assetId']);
      }
    }
  } catch {
    // A damaged recovery copy holds no usable references.
  }
}

/** Remaps lane clip references inside one advancedContent snapshot. */
function remapContentAudio(
  content: QuickEditAdvancedContent,
  assetIdMap: ReadonlyMap<string, string>
): QuickEditAdvancedContent {
  const audio = { ...content.audio };
  let changed = false;
  for (const lane of LANES) {
    audio[lane] = content.audio[lane].map((clip) => {
      const remapped = lookupAssetId(assetIdMap, clip.assetId);
      if (!remapped) return clip;
      changed = true;
      return { ...clip, assetId: remapped };
    });
  }
  return changed ? { ...content, audio } : content;
}

function remapRecoveryAudio(
  recoveryV1: string,
  assetIdMap: ReadonlyMap<string, string>
): string | null {
  try {
    const parsed: unknown = JSON.parse(recoveryV1);
    if (!isRecord(parsed) || !isRecord(parsed['audio'])) return null;
    const recoveryAudio = parsed['audio'];
    let changed = false;
    for (const lane of LANES) {
      const clips = recoveryAudio[lane];
      if (!Array.isArray(clips)) continue;
      recoveryAudio[lane] = clips.map((clip: unknown) => {
        if (!isRecord(clip)) return clip;
        const assetId = clip['assetId'];
        const remapped =
          typeof assetId === 'string' ? lookupAssetId(assetIdMap, assetId) : undefined;
        if (remapped) {
          changed = true;
          return { ...clip, assetId: remapped };
        }
        return clip;
      });
    }
    return changed ? JSON.stringify(parsed) : null;
  } catch {
    return null;
  }
}

/**
 * Applies a restored-asset id map to every stored review reference without
 * mutating the input; recovery copies are remapped inside their raw JSON.
 */
export function remapReviewAssetReferences(
  snapshot: VideoWorkspaceSnapshot,
  assetIdMap: ReadonlyMap<string, string>
): VideoWorkspaceSnapshot {
  if (!assetIdMap.size) return snapshot;
  const remappedSnapshot = remapSnapshot(snapshot, assetIdMap);
  const history = (snapshot.workspace.history ?? []).map((operation) => {
    if (operation.target !== 'advancedContent') return operation;
    const before = remapContentAudio(operation.before, assetIdMap);
    const after = remapContentAudio(operation.after, assetIdMap);
    if (before === operation.before && after === operation.after) return operation;
    return { ...operation, target: 'advancedContent' as const, before, after };
  });
  if (
    remappedSnapshot === snapshot &&
    history.every((operation, index) => operation === (snapshot.workspace.history ?? [])[index])
  )
    return snapshot;
  return {
    ...remappedSnapshot,
    workspace: { ...remappedSnapshot.workspace, history },
  };
}

function remapSnapshot(
  snapshot: VideoWorkspaceSnapshot,
  assetIdMap: ReadonlyMap<string, string>
): VideoWorkspaceSnapshot {
  const advanced = snapshot.workspace.advanced;
  const clipLanes = LANES.map((lane) => {
    const clips = advanced.audio[lane];
    if (!clips.some((clip) => lookupAssetId(assetIdMap, clip.assetId)))
      return [lane, clips] as const;
    return [
      lane,
      clips.map((clip) => {
        const remapped = lookupAssetId(assetIdMap, clip.assetId);
        return remapped ? { ...clip, assetId: remapped } : clip;
      }),
    ] as const;
  });
  const audio = { ...advanced.audio };
  for (const [lane, clips] of clipLanes) audio[lane] = [...clips];
  const recovery = advanced.recoveryV1 ? remapRecoveryAudio(advanced.recoveryV1, assetIdMap) : null;
  const changed =
    clipLanes.some(([lane, clips]) => clips !== advanced.audio[lane]) || recovery !== null;
  if (!changed) return snapshot;
  return {
    ...snapshot,
    workspace: {
      ...snapshot.workspace,
      advanced: {
        ...advanced,
        audio,
        ...(recovery ? { recoveryV1: recovery } : {}),
      },
    },
  };
}
