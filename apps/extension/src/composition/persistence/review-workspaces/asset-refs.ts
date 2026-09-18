import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { VideoWorkspace, VideoWorkspaceSnapshot } from './contracts';

const AUDIO_PREFIX = 'project-asset:';
const LANES = ['voiceover', 'music'] as const;
/** Portable metadata forbids local asset keys; review lane refs travel renamed. */
const PORTABLE_REF_KEY = 'assetRef';

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

/** Collects every project-asset reference the review keeps in its advanced state. */
export function collectReviewAssetReferences(
  workspace: Pick<VideoWorkspace, 'advanced'>
): ReadonlySet<string> {
  const references = new Set<string>();
  const advanced = workspace.advanced;
  for (const clip of [...advanced.audio.voiceover, ...advanced.audio.music]) {
    if (clip.assetId.startsWith(AUDIO_PREFIX)) references.add(clip.assetId);
  }
  if (advanced.recoveryV1) collectRecoveryReferences(advanced.recoveryV1, references);
  return references;
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
        if (typeof assetId === 'string' && lookupAssetId(assetIdMap, assetId)) {
          changed = true;
          return { ...clip, assetId: lookupAssetId(assetIdMap, assetId) };
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
