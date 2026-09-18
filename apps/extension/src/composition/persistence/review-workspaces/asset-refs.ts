import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { VideoWorkspaceSnapshot } from './contracts';

const AUDIO_PREFIX = 'project-asset:';
const LANES = ['voiceover', 'music'] as const;

/** Collects every project-asset reference the review keeps in its advanced state. */
export function collectReviewAssetReferences(
  snapshot: VideoWorkspaceSnapshot
): ReadonlySet<string> {
  const references = new Set<string>();
  const advanced = snapshot.workspace.advanced;
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
        if (typeof assetId === 'string' && assetIdMap.has(assetId)) {
          changed = true;
          return { ...clip, assetId: assetIdMap.get(assetId) };
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
    if (!clips.some((clip) => assetIdMap.has(clip.assetId))) return [lane, clips] as const;
    return [
      lane,
      clips.map((clip) =>
        assetIdMap.has(clip.assetId) ? { ...clip, assetId: assetIdMap.get(clip.assetId)! } : clip
      ),
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
