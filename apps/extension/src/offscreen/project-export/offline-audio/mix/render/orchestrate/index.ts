import { collectRenderableAudioClips } from '../../../clip-audio/index';
import { resolveProjectExportRange } from '../../../../../../features/video/project/export/range';
import { type VideoProjectExportSettings } from '../../../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../../../features/video/project/types/model';
import { createOfflineAudioMixContext } from './context';
import { renderOfflineAudioMixLoop } from './render-loop';

export async function renderOfflineAudioMix(
  project: VideoProject,
  settingsOrSignal?:
    | Pick<VideoProjectExportSettings, 'rangeEndSeconds' | 'rangeStartSeconds'>
    | AbortSignal,
  signal?: AbortSignal
): Promise<{
  buffer: AudioBuffer;
  settings: { numberOfChannels: number; sampleRate: number };
} | null> {
  const settings = settingsOrSignal instanceof AbortSignal ? undefined : settingsOrSignal;
  const resolvedSignal = settingsOrSignal instanceof AbortSignal ? settingsOrSignal : signal;
  const clipsWithAudio = collectRenderableAudioClips(project, settings);
  const actionAudioEnabled =
    project.actionPresentation?.enabled !== false &&
    project.actionFeedback?.some((group) =>
      group.settings.some(
        (setting) => setting.enabled && setting.presetId !== null && setting.volume > 0
      )
    );
  const actionAudioPresent = actionAudioEnabled
    ? (
        await import('../../../../../../features/video/review/project-action-audio')
      ).buildProjectActionAudioPlan(project).descriptors.length > 0
    : false;
  if (clipsWithAudio.length === 0 && !actionAudioPresent) return null;

  const range = settings ? resolveProjectExportRange(project, settings) : null;
  const { decodeContext, decodedBuffers, offlineContext } = createOfflineAudioMixContext(
    range?.duration ?? project.duration
  );

  return renderOfflineAudioMixLoop({
    clipsWithAudio,
    decodeContext,
    decodedBuffers,
    offlineContext,
    project,
    ...(range ? { actionRange: { start: range.start, end: range.end } } : {}),
    ...(resolvedSignal === undefined ? {} : { signal: resolvedSignal }),
  });
}
