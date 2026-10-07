import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
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

function stripContent<T extends QuickEditAdvancedContent | QuickEditAdvancedState>(
  content: T,
  assetId: string
): T {
  const result = {
    ...content,
    background: stripBackground(content.background, assetId),
    audio: {
      ...content.audio,
      voiceover: content.audio.voiceover.filter((clip) => clip.assetId !== assetId),
      music: content.audio.music.filter((clip) => clip.assetId !== assetId),
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
    const nextAudio =
      typeof audio === 'object' && audio !== null && !Array.isArray(audio)
        ? Object.fromEntries(
            Object.entries(audio).map(([key, clips]) => [
              key,
              (key === 'voiceover' || key === 'music') && Array.isArray(clips)
                ? clips.filter(
                    (clip: unknown) =>
                      typeof clip !== 'object' ||
                      clip === null ||
                      !('assetId' in clip) ||
                      clip.assetId !== assetId
                  )
                : clips,
            ])
          )
        : audio;
    const background = content['background'];
    return JSON.stringify({
      ...content,
      ...(nextAudio === undefined ? {} : { audio: nextAudio }),
      background: stripBackground(background, assetId),
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
