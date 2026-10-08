import type { ReviewSpeechTarget } from '../../../contracts/ai/audio';
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
  if (!isRecord(background)) return;
  const remembered = background['rememberedImage'];
  if (
    (background['type'] === 'image' && 'assetId' in background) ||
    (isRecord(remembered) && 'assetId' in remembered)
  ) {
    throw new Error(LOCAL_ASSET_ERROR);
  }
}

function assertNoLocalAudioRefs(audio: unknown): void {
  if (!isRecord(audio)) return;
  if (
    speechReplacements(audio['originalSpeech']).some(
      (entry) => isRecord(entry) && 'assetId' in entry
    )
  )
    throw new Error(LOCAL_ASSET_ERROR);
  for (const lane of LANES) {
    const clips = audio[lane];
    if (!Array.isArray(clips)) continue;
    for (const clip of clips) {
      if (isRecord(clip) && 'assetId' in clip) throw new Error(LOCAL_ASSET_ERROR);
      if (speechReplacements(clip).some((entry) => isRecord(entry) && 'assetId' in entry))
        throw new Error(LOCAL_ASSET_ERROR);
    }
  }
}

function speechReplacements(clip: unknown): unknown[] {
  if (!isRecord(clip) || !isRecord(clip['transcript'])) return [];
  const replacements = clip['transcript']['replacements'];
  return Array.isArray(replacements) ? replacements : [];
}

function mapSpeechReferences<T>(
  clip: T,
  transform: (value: Record<string, unknown>) => Record<string, unknown>
): T {
  if (
    !isRecord(clip) ||
    !isRecord(clip['transcript']) ||
    !Array.isArray(clip['transcript']['replacements'])
  )
    return clip;
  return {
    ...clip,
    transcript: {
      ...clip['transcript'],
      replacements: speechReplacements(clip).map((entry) =>
        isRecord(entry) ? transform(entry) : entry
      ),
    },
  };
}

function parseRecoveryContent(value: unknown): unknown {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Visits only the bounded, authored scene slots, including dormant variants. */
function mapPresentationReferences<T>(
  presentation: T,
  transform: (value: Record<string, unknown>) => Record<string, unknown>
): T {
  if (!isRecord(presentation)) return presentation;
  const next: Record<string, unknown> = {};
  for (const name of ['intro', 'outro']) {
    const slot = presentation[name];
    if (!isRecord(slot)) continue;
    const mapped = { ...slot };
    for (const kind of ['image', 'video']) {
      const value = slot[kind];
      if (isRecord(value)) mapped[kind] = transform(value);
    }
    next[name] = mapped;
  }
  return { ...presentation, ...next };
}

function assertPortableContentRefs(content: unknown, inspectRecovery = true): void {
  if (!isRecord(content)) return;
  if (isRecord(content['webcam']) && 'assetId' in content['webcam'])
    throw new Error(LOCAL_ASSET_ERROR);
  assertNoLocalImageRef(content['background']);
  const watermark = content['watermark'];
  if (isRecord(watermark) && isRecord(watermark['image']) && 'assetId' in watermark['image'])
    throw new Error(LOCAL_ASSET_ERROR);
  mapPresentationReferences(content['presentation'], (value) => {
    if ('assetId' in value) throw new Error(LOCAL_ASSET_ERROR);
    return value;
  });
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
  if (content['presentation'] !== undefined)
    next['presentation'] = mapPresentationReferences(content['presentation'], (value) => {
      if (typeof value[from] !== 'string') return value;
      const { [from]: reference, ...rest } = value;
      return { ...rest, [to]: reference };
    });
  const webcam = content['webcam'];
  if (isRecord(webcam) && typeof webcam[from] === 'string') {
    const { [from]: reference, ...rest } = webcam;
    next['webcam'] = { ...rest, [to]: reference };
  }
  if (isRecord(content['audio'])) next['audio'] = renameLaneRef(content['audio'], from, to);
  const background = content['background'];
  if (isRecord(background)) {
    const rename = (value: Record<string, unknown>) => {
      if (typeof value[from] !== 'string') return value;
      const { [from]: reference, ...rest } = value;
      return { ...rest, [to]: reference };
    };
    const remembered = background['rememberedImage'];
    next['background'] = {
      ...(background['type'] === 'image' ? rename(background) : background),
      ...(isRecord(remembered) ? { rememberedImage: rename(remembered) } : {}),
    };
  }
  const watermark = content['watermark'];
  if (isRecord(watermark) && isRecord(watermark['image'])) {
    const image = watermark['image'];
    if (typeof image[from] === 'string') {
      const { [from]: reference, ...rest } = image;
      next['watermark'] = { ...watermark, image: { ...rest, [to]: reference } };
    }
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
  const rename = (entry: Record<string, unknown>) => {
    if (typeof entry[sourceKey] !== 'string') return entry;
    const { [sourceKey]: nested, ...fields } = entry;
    return { ...fields, [targetKey]: nested };
  };
  const next = { ...audio };
  if (audio['originalSpeech'] !== undefined)
    next['originalSpeech'] = mapSpeechReferences(audio['originalSpeech'], rename);
  for (const lane of LANES) {
    const clips = audio[lane];
    if (!Array.isArray(clips)) continue;
    next[lane] = clips.map((clip: unknown) => {
      if (!isRecord(clip)) return clip;
      const reference = clip[sourceKey];
      if (typeof reference !== 'string') return mapSpeechReferences(clip, rename);
      const { [sourceKey]: _renamed, ...rest } = clip;
      return mapSpeechReferences({ ...rest, [targetKey]: reference }, (entry) => {
        if (typeof entry[sourceKey] !== 'string') return entry;
        const { [sourceKey]: nested, ...fields } = entry;
        return { ...fields, [targetKey]: nested };
      });
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

/** Exact audio placement identity retained by current content, undo/redo or recovery. */
export function reviewWorkspaceHasAudioClip(
  workspace: Pick<VideoWorkspace, 'advanced' | 'history'>,
  clipId: string,
  assetId: string
): boolean {
  const matches = (content: unknown, recovery = true): boolean => {
    if (!isRecord(content)) return false;
    const audio = content['audio'];
    if (isRecord(audio)) {
      for (const lane of LANES) {
        const clips = audio[lane];
        if (
          Array.isArray(clips) &&
          clips.some(
            (clip: unknown) =>
              isRecord(clip) && clip['id'] === clipId && clip['assetId'] === assetId
          )
        )
          return true;
      }
    }
    return recovery && matches(parseRecoveryContent(content['recoveryV1']), false);
  };
  return (
    matches(workspace.advanced) ||
    workspace.history.some(
      (operation) =>
        operation.target === 'advancedContent' &&
        (matches(operation.before) || matches(operation.after))
    )
  );
}

/** Exact watermark ownership survives disabled modes, undo/redo and legacy recovery. */
export function reviewWorkspaceHasWatermarkImage(
  workspace: Pick<VideoWorkspace, 'advanced' | 'history'>,
  assetId: string
): boolean {
  const matches = (content: unknown, recovery = true): boolean => {
    if (!isRecord(content)) return false;
    const watermark = content['watermark'];
    if (
      isRecord(watermark) &&
      isRecord(watermark['image']) &&
      watermark['image']['assetId'] === assetId
    )
      return true;
    return recovery && matches(parseRecoveryContent(content['recoveryV1']), false);
  };
  return (
    matches(workspace.advanced) ||
    workspace.history.some(
      (operation) =>
        operation.target === 'advancedContent' &&
        (matches(operation.before) || matches(operation.after))
    )
  );
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
  content: Pick<
    QuickEditAdvancedContent,
    'audio' | 'background' | 'webcam' | 'watermark' | 'presentation'
  >,
  into: Set<string>
): void {
  collectImageReference(content.background, into);
  collectAssetReference(content.webcam, into);
  collectAssetReference(content.watermark?.image, into);
  mapPresentationReferences(content.presentation, (value) => {
    collectAssetReference(value, into);
    return value;
  });
  for (const replacement of content.audio.originalSpeech?.transcript.replacements ?? [])
    collectAssetReference(replacement, into);
  for (const lane of LANES) {
    for (const clip of content.audio[lane]) {
      if (clip.assetId.startsWith(ASSET_PREFIX)) into.add(clip.assetId);
      for (const replacement of clip.transcript?.replacements ?? [])
        collectAssetReference(replacement, into);
    }
  }
}

function collectAssetReference(webcam: unknown, into: Set<string>): void {
  if (
    isRecord(webcam) &&
    typeof webcam['assetId'] === 'string' &&
    webcam['assetId'].startsWith(ASSET_PREFIX)
  )
    into.add(webcam['assetId']);
}

function remapAssetReference<T>(webcam: T, assetIdMap: ReadonlyMap<string, string>): T {
  if (!isRecord(webcam) || typeof webcam['assetId'] !== 'string') return webcam;
  return { ...webcam, assetId: requireMappedAssetId(assetIdMap, webcam['assetId']) };
}

function collectImageReference(background: unknown, into: Set<string>): void {
  if (!isRecord(background)) return;
  if (background['type'] === 'image') collectAssetReference(background, into);
  collectAssetReference(background['rememberedImage'], into);
}

function remapImageReference<T>(background: T, assetIdMap: ReadonlyMap<string, string>): T {
  if (!isRecord(background)) return background;
  const active =
    background['type'] === 'image' ? remapAssetReference(background, assetIdMap) : background;
  const remembered = remapAssetReference(background['rememberedImage'], assetIdMap);
  if (active === background && remembered === background['rememberedImage']) return background;
  return { ...active, ...(remembered === undefined ? {} : { rememberedImage: remembered }) };
}

function remapWatermarkReference<T>(watermark: T, assetIdMap: ReadonlyMap<string, string>): T {
  if (!isRecord(watermark)) return watermark;
  const image = remapAssetReference(watermark['image'], assetIdMap);
  return image === watermark['image'] ? watermark : { ...watermark, image };
}

function collectRecoveryReferences(recoveryV1: string, into: Set<string>): void {
  try {
    const parsed: unknown = JSON.parse(recoveryV1);
    if (!isRecord(parsed)) return;
    mapPresentationReferences(parsed['presentation'], (value) => {
      collectAssetReference(value, into);
      return value;
    });
    collectAssetReference(parsed['webcam'], into);
    collectImageReference(parsed['background'], into);
    if (isRecord(parsed['watermark'])) collectAssetReference(parsed['watermark']['image'], into);
    if (!isRecord(parsed['audio'])) return;
    const recoveryAudio = parsed['audio'];
    for (const replacement of speechReplacements(recoveryAudio['originalSpeech']))
      collectAssetReference(replacement, into);
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
        for (const replacement of speechReplacements(clip))
          collectAssetReference(replacement, into);
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
  if (audio.originalSpeech) {
    audio.originalSpeech = mapSpeechReferences(audio.originalSpeech, (entry) =>
      remapAssetReference(entry, assetIdMap)
    );
    changed = true;
  }
  for (const lane of LANES) {
    audio[lane] = content.audio[lane].map((clip) => {
      const remapped = requireMappedAssetId(assetIdMap, clip.assetId);
      changed = true;
      return {
        ...clip,
        assetId: remapped,
        ...(clip.transcript
          ? {
              transcript: {
                ...clip.transcript,
                replacements: clip.transcript.replacements.map((entry) => ({
                  ...entry,
                  assetId: requireMappedAssetId(assetIdMap, entry.assetId),
                })),
              },
            }
          : {}),
      };
    });
  }
  const background = remapImageReference(content.background, assetIdMap);
  const webcam = remapAssetReference(content.webcam, assetIdMap);
  const presentation = mapPresentationReferences(content.presentation, (value) =>
    remapAssetReference(value, assetIdMap)
  );
  const watermark = remapWatermarkReference(content.watermark, assetIdMap);
  return changed ||
    background !== content.background ||
    webcam !== content.webcam ||
    presentation !== content.presentation ||
    watermark !== content.watermark
    ? {
        ...content,
        audio,
        background,
        ...(webcam ? { webcam } : {}),
        ...(watermark ? { watermark } : {}),
        ...(presentation ? { presentation } : {}),
      }
    : content;
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
  const webcam = remapAssetReference(parsed['webcam'], assetIdMap);
  const background = remapImageReference(parsed['background'], assetIdMap);
  const presentation = mapPresentationReferences(parsed['presentation'], (value) =>
    remapAssetReference(value, assetIdMap)
  );
  const watermark = remapWatermarkReference(parsed['watermark'], assetIdMap);
  let changed =
    background !== parsed['background'] ||
    webcam !== parsed['webcam'] ||
    presentation !== parsed['presentation'] ||
    watermark !== parsed['watermark'];
  if (presentation !== parsed['presentation']) parsed['presentation'] = presentation;
  if (watermark !== parsed['watermark']) parsed['watermark'] = watermark;
  if (background !== parsed['background']) parsed['background'] = background;
  if (webcam !== parsed['webcam']) parsed['webcam'] = webcam;
  const recoveryAudio = isRecord(parsed['audio']) ? parsed['audio'] : {};
  if (recoveryAudio['originalSpeech'] !== undefined) {
    recoveryAudio['originalSpeech'] = mapSpeechReferences(
      recoveryAudio['originalSpeech'],
      (entry) => remapAssetReference(entry, assetIdMap)
    );
    changed = true;
  }
  for (const lane of LANES) {
    const clips = recoveryAudio[lane];
    if (!Array.isArray(clips)) continue;
    recoveryAudio[lane] = clips.map((clip: unknown) => {
      if (!isRecord(clip)) return clip;
      const assetId = clip['assetId'];
      if (typeof assetId !== 'string') {
        const mapped = mapSpeechReferences(clip, (entry) => remapAssetReference(entry, assetIdMap));
        changed ||= mapped !== clip;
        return mapped;
      }
      const remapped = requireMappedAssetId(assetIdMap, assetId);
      changed = true;
      return mapSpeechReferences({ ...clip, assetId: remapped }, (entry) =>
        remapAssetReference(entry, assetIdMap)
      );
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

/** Exact retained scene slot/kind ownership, independent of its selected mode. */
export function reviewWorkspaceHasSceneResource(
  workspace: Pick<VideoWorkspace, 'advanced' | 'history'>,
  slot: 'intro' | 'outro',
  kind: 'image' | 'video',
  assetId: string
): boolean {
  const matches = (content: unknown, recovery = true): boolean => {
    if (!isRecord(content)) return false;
    const presentation = content['presentation'];
    const entry = isRecord(presentation) ? presentation[slot] : undefined;
    const resource = isRecord(entry) ? entry[kind] : undefined;
    if (isRecord(resource) && resource['assetId'] === assetId) return true;
    return recovery && matches(parseRecoveryContent(content['recoveryV1']), false);
  };
  return (
    matches(workspace.advanced) ||
    workspace.history.some(
      (operation) =>
        operation.target === 'advancedContent' &&
        (matches(operation.before) || matches(operation.after))
    )
  );
}

/** Exact accepted identity retained independently of draft phrases, lane enablement or cuts. */
export function reviewWorkspaceHasSpeechReplacement(
  workspace: Pick<VideoWorkspace, 'advanced' | 'history'>,
  target: ReviewSpeechTarget,
  replacementId: string,
  assetId: string
): boolean {
  const matches = (content: unknown, recovery = true): boolean => {
    if (!isRecord(content)) return false;
    const audio = content['audio'];
    if (isRecord(audio)) {
      const sources =
        target.kind === 'original'
          ? [audio['originalSpeech']]
          : Array.isArray(audio['voiceover'])
            ? audio['voiceover'].filter(
                (clip: unknown) => isRecord(clip) && clip['id'] === target.clipId
              )
            : [];
      if (
        sources.some((source) =>
          speechReplacements(source).some(
            (entry) =>
              isRecord(entry) && entry['id'] === replacementId && entry['assetId'] === assetId
          )
        )
      )
        return true;
    }
    return recovery && matches(parseRecoveryContent(content['recoveryV1']), false);
  };
  return (
    matches(workspace.advanced) ||
    workspace.history.some(
      (operation) =>
        operation.target === 'advancedContent' &&
        (matches(operation.before) || matches(operation.after))
    )
  );
}
