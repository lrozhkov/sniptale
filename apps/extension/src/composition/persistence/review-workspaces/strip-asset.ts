import type {
  QuickEditAdvancedContent,
  QuickEditAdvancedState,
} from '../../../features/video/review/advanced/types';
import type { VideoWorkspace } from './contracts';
import { collectReviewAssetReferences } from './asset-refs';
import { parseVideoWorkspace } from './parser';

function stripContent<T extends QuickEditAdvancedContent | QuickEditAdvancedState>(
  content: T,
  assetId: string
): T {
  return {
    ...content,
    background:
      content.background.enabled &&
      content.background.type === 'image' &&
      content.background.assetId === assetId
        ? { enabled: false }
        : content.background,
    audio: {
      ...content.audio,
      voiceover: content.audio.voiceover.filter((clip) => clip.assetId !== assetId),
      music: content.audio.music.filter((clip) => clip.assetId !== assetId),
    },
  };
}

function stripRecovery(value: string | undefined, assetId: string): string | undefined {
  if (!value) return value;
  try {
    const raw: unknown = JSON.parse(value);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return value;
    const content = raw as Record<string, unknown>;
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
      background:
        typeof background === 'object' &&
        background !== null &&
        'type' in background &&
        background.type === 'image' &&
        'assetId' in background &&
        background.assetId === assetId
          ? { enabled: false }
          : background,
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
  const candidate = {
    ...workspace,
    advanced: {
      ...advanced,
      ...(recoveryV1 === undefined ? {} : { recoveryV1 }),
    },
    history: workspace.history.map((operation) =>
      operation.target === 'advancedContent'
        ? {
            ...operation,
            before: stripContent(operation.before, assetId),
            after: stripContent(operation.after, assetId),
          }
        : operation
    ),
    revision: workspace.revision + 1,
    updatedAt,
  } satisfies VideoWorkspace;
  const parsed = parseVideoWorkspace(candidate);
  if (!parsed || collectReviewAssetReferences(parsed).has(assetId)) {
    throw new Error('Quick-edit asset removal could not be validated.');
  }
  return parsed;
}
