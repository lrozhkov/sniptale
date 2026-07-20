import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../features/video/project/types';
import type { ExportAudioSettings } from '../codecs/types';
import { loadImagesForProject, preloadClipVideos } from '../media-loading';
import { syncClipPlayback, syncVideoClipFrame } from '../media-playback';
import { renderOfflineAudioMix } from '../offline-audio';

export { loadBlobForAsset } from '../media-loading';

export interface ClipAudioNode {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export interface ProjectExportMediaState {
  clipMediaElements: Map<string, HTMLMediaElement>;
  clipAudioNodes: Map<string, ClipAudioNode>;
  audioContext: AudioContext | null;
  audioDestination: MediaStreamAudioDestinationNode | null;
  exportAudioSettings: ExportAudioSettings | null;
  assetUrls: string[];
}

export interface PreparedProjectExportAudio {
  dispose(): void;
  start(): void;
  tracks: MediaStreamTrack[];
}

const logger = createLogger({ namespace: 'OffscreenProjectExport' });

export async function setupExportAudio(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  job: ProjectExportMediaState,
  signal?: AbortSignal
): Promise<PreparedProjectExportAudio> {
  const mix = await renderOfflineAudioMix(project, settings, signal);
  if (!mix) {
    job.exportAudioSettings = null;
    return { dispose() {}, start() {}, tracks: [] };
  }

  const audioContext = new AudioContext({
    latencyHint: 'interactive',
    sampleRate: mix.settings.sampleRate,
  });
  const destination = audioContext.createMediaStreamDestination();
  const source = audioContext.createBufferSource();
  source.buffer = mix.buffer;
  source.connect(destination);
  job.audioContext = audioContext;
  job.audioDestination = destination;

  if (audioContext.state === 'suspended') {
    await audioContext.resume().catch((error) => {
      logger.warn('Failed to resume AudioContext', error);
    });
  }

  job.exportAudioSettings = mix.settings;
  let started = false;
  return {
    dispose() {
      if (started) {
        try {
          source.stop();
        } catch {
          // A naturally ended source is already stopped.
        }
      }
      source.disconnect();
    },
    start() {
      if (started) return;
      started = true;
      source.start();
    },
    tracks: destination.stream.getAudioTracks(),
  };
}

export { loadImagesForProject, preloadClipVideos, syncClipPlayback, syncVideoClipFrame };
