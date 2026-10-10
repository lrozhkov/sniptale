import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { QuickEditAudioClip } from '../../../features/video/review/advanced/types';
import type {
  QuickEditAdvancedContent,
  QuickEditAdvancedState,
} from '../../../features/video/review/advanced/types';
import type { VideoWorkspace } from './contracts';
import { collectReviewAssetReferences } from './asset-refs';
import { parseVideoWorkspace } from './parser';

function stripBackground<T>(background: T, assetId: string): T | { enabled: false } {
  if (!isRecord(background)) return background;
  if (background['type'] === 'image' && background['assetId'] === assetId)
    return { enabled: false };
  const remembered = background['rememberedImage'];
  if (!isRecord(remembered) || remembered['assetId'] !== assetId) return background;
  const { rememberedImage: _removed, ...rest } = background;
  return rest as T;
}

function stripWatermark<T>(watermark: T, assetId: string): T {
  if (
    !isRecord(watermark) ||
    !isRecord(watermark['image']) ||
    watermark['image']['assetId'] !== assetId
  )
    return watermark;
  const { image: _removed, ...rest } = watermark;
  return { ...rest, mode: watermark['mode'] === 'image' ? 'none' : watermark['mode'] } as T;
}

function stripPresentation<T>(presentation: T, assetId: string): T {
  if (!isRecord(presentation)) return presentation;
  const next: Record<string, unknown> = {};
  for (const name of ['intro', 'outro']) {
    const slot = presentation[name];
    if (!isRecord(slot)) continue;
    const cleaned = { ...slot };
    for (const kind of ['image', 'video']) {
      const value = slot[kind];
      if (!isRecord(value) || value['assetId'] !== assetId) continue;
      delete cleaned[kind];
      if (cleaned['mode'] === kind) cleaned['mode'] = 'none';
    }
    next[name] = cleaned;
  }
  return { ...presentation, ...next };
}

function stripAudioClips(clips: QuickEditAudioClip[], assetId: string): QuickEditAudioClip[] {
  return clips
    .filter((clip) => clip.assetId !== assetId)
    .map((clip) =>
      clip.transcript
        ? {
            ...clip,
            transcript: {
              ...clip.transcript,
              replacements: clip.transcript.replacements.filter(
                (entry) => entry.assetId !== assetId
              ),
            },
          }
        : clip
    );
}

/** Associations follow removed clip identities; manually detached attenuation remains authored. */
function stripOriginalMuteBindings<T>(original: T, clips: unknown, assetId: string): T {
  if (!isRecord(original) || !Array.isArray(original['mutes']) || !Array.isArray(clips))
    return original;
  const removedIds = new Set(
    clips.flatMap((clip: unknown) =>
      isRecord(clip) && clip['assetId'] === assetId && typeof clip['id'] === 'string'
        ? [clip['id']]
        : []
    )
  );
  if (!removedIds.size) return original;
  return {
    ...original,
    mutes: original['mutes'].filter(
      (mute: unknown) =>
        !isRecord(mute) ||
        mute['kind'] !== 'take' ||
        typeof mute['clipId'] !== 'string' ||
        !removedIds.has(mute['clipId'])
    ),
  } as T;
}

function stripRecoverySpeech(clip: unknown, assetId: string): unknown {
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
      replacements: clip['transcript']['replacements'].filter(
        (entry: unknown) => !isRecord(entry) || entry['assetId'] !== assetId
      ),
    },
  };
}

function stripContent<T extends QuickEditAdvancedContent | QuickEditAdvancedState>(
  content: T,
  assetId: string
): T {
  const result = {
    ...content,
    background: stripBackground(content.background, assetId),
    ...(content.presentation
      ? { presentation: stripPresentation(content.presentation, assetId) }
      : {}),
    ...(content.watermark ? { watermark: stripWatermark(content.watermark, assetId) } : {}),
    audio: {
      ...content.audio,
      original: stripOriginalMuteBindings(content.audio.original, content.audio.voiceover, assetId),
      ...(content.audio.originalSpeech
        ? {
            originalSpeech: {
              ...content.audio.originalSpeech,
              transcript: {
                ...content.audio.originalSpeech.transcript,
                replacements: content.audio.originalSpeech.transcript.replacements.filter(
                  (entry) => entry.assetId !== assetId
                ),
              },
            },
          }
        : {}),
      voiceover: stripAudioClips(content.audio.voiceover, assetId),
      music: stripAudioClips(content.audio.music, assetId),
    },
  };
  if (result.webcam?.assetId === assetId) delete result.webcam;
  return result;
}

function stripRecovery(value: string | undefined, assetId: string): string | undefined {
  if (!value) return value;
  try {
    const raw: unknown = JSON.parse(value);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return value;
    const content = raw as Record<string, unknown>;
    const webcam = content['webcam'];
    if (
      typeof webcam === 'object' &&
      webcam !== null &&
      'assetId' in webcam &&
      webcam.assetId === assetId
    )
      delete content['webcam'];
    const audio = content['audio'];
    const nextAudio = isRecord(audio)
      ? Object.fromEntries(
          Object.entries(audio).map(([key, clips]) => [
            key,
            (key === 'voiceover' || key === 'music') && Array.isArray(clips)
              ? clips
                  .filter(
                    (clip: unknown) =>
                      typeof clip !== 'object' ||
                      clip === null ||
                      !('assetId' in clip) ||
                      clip.assetId !== assetId
                  )
                  .map((clip: unknown) => stripRecoverySpeech(clip, assetId))
              : key === 'original'
                ? stripOriginalMuteBindings(clips, audio['voiceover'], assetId)
                : key === 'originalSpeech'
                  ? stripRecoverySpeech(clips, assetId)
                  : clips,
          ])
        )
      : audio;
    const background = content['background'];
    return JSON.stringify({
      ...content,
      ...(nextAudio === undefined ? {} : { audio: nextAudio }),
      background: stripBackground(background, assetId),
      ...(content['presentation'] === undefined
        ? {}
        : { presentation: stripPresentation(content['presentation'], assetId) }),
      ...(content['watermark'] === undefined
        ? {}
        : { watermark: stripWatermark(content['watermark'], assetId) }),
    });
  } catch {
    return value;
  }
}

/** Removes an auxiliary source from current content, undo/redo and legacy recovery together. */
export function stripReviewAssetReference(
  workspace: VideoWorkspace,
  assetId: string,
  updatedAt: number
): VideoWorkspace {
  if (!collectReviewAssetReferences(workspace).has(assetId)) return workspace;
  if (workspace.sourceAssetId === assetId)
    throw new Error('The required quick-edit source cannot be removed.');
  const advanced = stripContent(workspace.advanced, assetId);
  const recoveryV1 = stripRecovery(workspace.advanced.recoveryV1, assetId);
  let cursor = workspace.cursor;
  const history = workspace.history.flatMap<VideoWorkspace['history'][number]>(
    (operation, index) => {
      if (operation.target !== 'advancedContent') return [operation];
      const before = stripContent(operation.before, assetId);
      const after = stripContent(operation.after, assetId);
      // A source-only edit becomes a no-op; replay rejects it unless its cursor slot is removed.
      if (JSON.stringify(before) === JSON.stringify(after)) {
        if (index < workspace.cursor) cursor--;
        return [];
      }
      return [{ ...operation, before, after }];
    }
  );
  const candidate = {
    ...workspace,
    advanced: {
      ...advanced,
      ...(recoveryV1 === undefined ? {} : { recoveryV1 }),
    },
    history,
    cursor,
    revision: workspace.revision + 1,
    updatedAt,
  } satisfies VideoWorkspace;
  const parsed = parseVideoWorkspace(candidate);
  if (!parsed || collectReviewAssetReferences(parsed).has(assetId)) {
    throw new Error('Quick-edit asset removal could not be validated.');
  }
  return parsed;
}
