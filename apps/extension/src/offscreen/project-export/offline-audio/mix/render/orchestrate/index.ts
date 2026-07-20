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
  if (clipsWithAudio.length === 0) {
    return null;
  }

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
    ...(resolvedSignal === undefined ? {} : { signal: resolvedSignal }),
  });
}
