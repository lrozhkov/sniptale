import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { QuickEditAdvancedContent } from '../../../features/video/review/advanced/types';
import type { VideoWorkspace, VideoWorkspaceSnapshot } from './contracts';

const ASSET_PREFIX = 'project-asset:';
const LANES = ['voiceover', 'music'] as const;
/** Portable metadata forbids local asset keys; review lane refs travel renamed. */
const PORTABLE_REF_KEY = 'assetRef';
const LOCAL_ASSET_ERROR = 'Portable video review contains a local asset id.';
const UNRESOLVED_ASSET_ERROR = 'Portable video review asset reference is unresolved.';

function assertNoLocalImageRef(background: unknown): void {
  if (isRecord(background) && background['type'] === 'image' && 'assetId' in background) {
    throw new Error(LOCAL_ASSET_ERROR);
  }
}

function assertNoLocalAudioRefs(audio: unknown): void {
  if (!isRecord(audio)) return;
  for (const lane of LANES) {
    const clips = audio[lane];
    if (!Array.isArray(clips)) continue;
    for (const clip of clips) {
      if (isRecord(clip) && 'assetId' in clip) throw new Error(LOCAL_ASSET_ERROR);
    }
  }
}

function parseRecoveryContent(value: unknown): unknown {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function assertPortableContentRefs(content: unknown, inspectRecovery = true): void {
  if (!isRecord(content)) return;
  assertNoLocalImageRef(content['background']);
  assertNoLocalAudioRefs(content['audio']);
  if (inspectRecovery)
    assertPortableContentRefs(parseRecoveryContent(content['recoveryV1']), false);
}

/** Rejects runtime-only asset keys anywhere portable review content can retain them. */
export function assertPortableReviewAssetRefs(workspace: unknown): void {
  if (!isRecord(workspace)) return;
  assertPortableContentRefs(workspace['advanced']);
  const history = workspace['history'];
  if (!Array.isArray(history)) return;
  for (const operation of history) {
    if (!isRecord(operation) || operation['target'] !== 'advancedContent') continue;
    assertPortableContentRefs(operation['before']);
    assertPortableContentRefs(operation['after']);
  }
}

/** Walks every history `advancedContent` operation payload once per transform. */
function mapHistoryContent(
  value: unknown,
  transform: (audio: Record<string, unknown>) => Record<string, unknown>
): unknown {
  if (!isRecord(value) || !Array.isArray(value['history']) || !value['history'].length)
    return value;
  const history = (value['history'] as unknown[]).map((operation) => {
    if (!isRecord(operation) || operation['target'] !== 'advancedContent') return operation;
    const mapPayload = (payload: unknown) => {
      return isRecord(payload) ? transform(payload) : payload;
    };
    return {
      ...operation,
      ...(operation['before'] === undefined ? {} : { before: mapPayload(operation['before']) }),
      ...(operation['after'] === undefined ? {} : { after: mapPayload(operation['after']) }),
    };
  });
  return { ...value, history };
}

/** Renames the audio and image asset keys so archive metadata stays portable-safe. */
export function encodePortableReviewAssetRefs<T>(review: T): T {
  if (
    !isRecord(review) ||
    !isRecord(review['workspace']) ||
    !isRecord(review['workspace']['advanced'])
  )
    return review;
  const advanced = review['workspace']['advanced'] as Record<string, unknown>;
  return {
    ...review,
    workspace: {
      ...review['workspace'],
      advanced: renameContentRefs(advanced, 'assetId', PORTABLE_REF_KEY),
      history: (
        mapHistoryContent(review['workspace'], (laneAudio) =>
          renameContentRefs(laneAudio, 'assetId', PORTABLE_REF_KEY)
        ) as { history: VideoWorkspace['history'] }
      ).history,
    },
  } as T;
}

/** Restores the runtime asset reference shape from its portable encoding. */
export function decodePortableReviewAssetRefs<T>(workspace: T): T {
  if (!isRecord(workspace) || !isRecord(workspace['advanced'])) return workspace;
  const advanced = workspace['advanced'] as Record<string, unknown>;
  return {
    ...workspace,
    advanced: renameContentRefs(advanced, PORTABLE_REF_KEY, 'assetId'),
    history: (
      mapHistoryContent(workspace, (laneAudio) =>
        renameContentRefs(laneAudio, PORTABLE_REF_KEY, 'assetId')
      ) as { history: unknown }
    ).history as typeof workspace.history,
  } as T;
}

/** Explicit reference-bearing fields; opaque recovery JSON uses the same shape. */
function renameContentRefs(
  content: Record<string, unknown>,
  from: string,
  to: string,
  recovery = true
): Record<string, unknown> {
  const next = { ...content };
  if (isRecord(content['audio'])) next['audio'] = renameLaneRef(content['audio'], from, to);
  const background = content['background'];
  if (
    isRecord(background) &&
    background['type'] === 'image' &&
    typeof background[from] === 'string'
  ) {
    const { [from]: reference, ...rest } = background;
    next['background'] = { ...rest, [to]: reference };
  }
  if (recovery && typeof content['recoveryV1'] === 'string') {
    try {
      const recovery: unknown = JSON.parse(content['recoveryV1']);
      if (isRecord(recovery)) {
        next['recoveryV1'] = JSON.stringify(renameContentRefs(recovery, from, to, false));
      }
    } catch {
      /* Invalid recovery text stays intact. */
    }
  }
  return next;
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
  if (!reference.startsWith(ASSET_PREFIX)) return undefined;
  const bare = reference.slice(ASSET_PREFIX.length);
  const mapped = assetIdMap.get(reference) ?? assetIdMap.get(bare);
  if (mapped === undefined) return undefined;
  return mapped.startsWith(ASSET_PREFIX) ? mapped : ASSET_PREFIX + mapped;
}

function requireMappedAssetId(assetIdMap: ReadonlyMap<string, string>, reference: string): string {
  const mapped = lookupAssetId(assetIdMap, reference);
  if (!mapped) throw new Error(UNRESOLVED_ASSET_ERROR);
  return mapped;
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
  content: Pick<QuickEditAdvancedContent, 'audio' | 'background'>,
  into: Set<string>
): void {
  collectImageReference(content.background, into);
  for (const lane of LANES) {
    for (const clip of content.audio[lane]) {
      if (clip.assetId.startsWith(ASSET_PREFIX)) into.add(clip.assetId);
    }
  }
}

function collectImageReference(background: unknown, into: Set<string>): void {
  if (
    isRecord(background) &&
    background['type'] === 'image' &&
    typeof background['assetId'] === 'string' &&
    background['assetId'].startsWith(ASSET_PREFIX)
  )
    into.add(background['assetId']);
}

function remapImageReference<T>(background: T, assetIdMap: ReadonlyMap<string, string>): T {
  if (
    !isRecord(background) ||
    background['type'] !== 'image' ||
    typeof background['assetId'] !== 'string'
  )
    return background;
  const assetId = requireMappedAssetId(assetIdMap, background['assetId']);
  return { ...background, assetId };
}

function collectRecoveryReferences(recoveryV1: string, into: Set<string>): void {
  try {
    const parsed: unknown = JSON.parse(recoveryV1);
    if (!isRecord(parsed)) return;
    collectImageReference(parsed['background'], into);
    if (!isRecord(parsed['audio'])) return;
    const recoveryAudio = parsed['audio'];
    for (const lane of LANES) {
      const clips = recoveryAudio[lane];
      if (!Array.isArray(clips)) continue;
      for (const clip of clips) {
        if (
          isRecord(clip) &&
          typeof clip['assetId'] === 'string' &&
          clip['assetId'].startsWith(ASSET_PREFIX)
        )
          into.add(clip['assetId']);
      }
    }
  } catch {
    // A damaged recovery copy holds no usable references.
  }
}

/** Remaps audio and image references inside one advancedContent snapshot. */
function remapContentReferences(
  content: QuickEditAdvancedContent,
  assetIdMap: ReadonlyMap<string, string>
): QuickEditAdvancedContent {
  const audio = { ...content.audio };
  let changed = false;
  for (const lane of LANES) {
    audio[lane] = content.audio[lane].map((clip) => {
      const remapped = requireMappedAssetId(assetIdMap, clip.assetId);
      changed = true;
      return { ...clip, assetId: remapped };
    });
  }
  const background = remapImageReference(content.background, assetIdMap);
  return changed || background !== content.background ? { ...content, audio, background } : content;
}

function remapRecoveryReferences(
  recoveryV1: string,
  assetIdMap: ReadonlyMap<string, string>
): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(recoveryV1);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const background = remapImageReference(parsed['background'], assetIdMap);
  let changed = background !== parsed['background'];
  if (changed) parsed['background'] = background;
  const recoveryAudio = isRecord(parsed['audio']) ? parsed['audio'] : {};
  for (const lane of LANES) {
    const clips = recoveryAudio[lane];
    if (!Array.isArray(clips)) continue;
    recoveryAudio[lane] = clips.map((clip: unknown) => {
      if (!isRecord(clip)) return clip;
      const assetId = clip['assetId'];
      if (typeof assetId !== 'string') return clip;
      const remapped = requireMappedAssetId(assetIdMap, assetId);
      changed = true;
      return { ...clip, assetId: remapped };
    });
  }
  return changed ? JSON.stringify(parsed) : null;
}

/**
 * Applies a restored-asset id map to every stored review reference without
 * mutating the input; recovery copies are remapped inside their raw JSON.
 */
export function remapReviewAssetReferences(
  snapshot: VideoWorkspaceSnapshot,
  assetIdMap: ReadonlyMap<string, string>
): VideoWorkspaceSnapshot {
  const remappedSnapshot = remapSnapshot(snapshot, assetIdMap);
  const history = (snapshot.workspace.history ?? []).map((operation) => {
    if (operation.target !== 'advancedContent') return operation;
    const before = remapContentReferences(operation.before, assetIdMap);
    const after = remapContentReferences(operation.after, assetIdMap);
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
  const content = remapContentReferences(advanced, assetIdMap);
  const recovery = advanced.recoveryV1
    ? remapRecoveryReferences(advanced.recoveryV1, assetIdMap)
    : null;
  if (content === advanced && recovery === null) return snapshot;
  return {
    ...snapshot,
    workspace: {
      ...snapshot.workspace,
      advanced: {
        ...advanced,
        ...content,
        ...(recovery ? { recoveryV1: recovery } : {}),
      },
    },
  };
}
