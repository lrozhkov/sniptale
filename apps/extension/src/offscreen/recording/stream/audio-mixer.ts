import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { AudioMixerGraph } from './audio-mixer-graph';
import {
  buildMicrophoneAudioConstraints,
  resolveMicrophoneGain,
} from '@sniptale/runtime-contracts/video/types/microphone-processing';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

const logger = createLogger({ namespace: 'OffscreenAudioMixer' });

export class AudioMixer {
  private readonly graph = new AudioMixerGraph();
  private micStream: MediaStream | null = null;
  private microphoneGeneration = 0;

  private stopStreamTracks(stream: MediaStream | null): void {
    stream?.getTracks().forEach((track) => track.stop());
  }

  private releaseTabStream(): void {
    this.graph.disconnectTabStream();
  }

  private releaseMicrophoneStream(): void {
    this.microphoneGeneration += 1;
    this.graph.disconnectMicrophoneStream();
    this.stopStreamTracks(this.micStream);
    this.micStream = null;
  }

  async initialize(): Promise<void> {
    await this.graph.initialize();
    logger.log('Initialized');
  }

  async addTabAudio(tabStream: MediaStream): Promise<void> {
    await this.initialize();

    const audioTracks = tabStream.getAudioTracks();
    if (audioTracks.length === 0) {
      logger.warn('No audio tracks in tab stream');
      return;
    }

    this.releaseTabStream();
    const audioOnlyStream = new MediaStream(audioTracks);
    this.graph.connectTabStream(audioOnlyStream);

    logger.log('Tab audio added');
  }

  async addMicrophone(settingsOrDeviceId?: MicrophoneMixerSettings | string | null): Promise<void> {
    await this.initialize();
    let candidate: MediaStream | null = null;

    try {
      this.releaseMicrophoneStream();
      const operationGeneration = this.microphoneGeneration;
      const settings = normalizeMicrophoneMixerSettings(settingsOrDeviceId);
      candidate = await navigator.mediaDevices.getUserMedia({
        audio: buildMicrophoneAudioConstraints(settings),
      });
      if (operationGeneration !== this.microphoneGeneration) {
        this.stopStreamTracks(candidate);
        throw new Error('Microphone initialization was superseded');
      }
      this.graph.connectMicrophoneStream(candidate, resolveMicrophoneGain(settings));
      this.micStream = candidate;

      logger.log('Microphone added');
    } catch (error) {
      if (candidate && candidate !== this.micStream) this.stopStreamTracks(candidate);
      this.releaseMicrophoneStream();
      logger.error('Failed to add microphone', error);
      throw new Error(translate('popup.video.microphoneAccessError'), { cause: error });
    }
  }

  async switchMicrophone(settings: MicrophoneMixerSettings): Promise<void> {
    const operationGeneration = (this.microphoneGeneration += 1);
    const candidate = await navigator.mediaDevices.getUserMedia({
      audio: buildMicrophoneAudioConstraints(settings),
    });
    if (operationGeneration !== this.microphoneGeneration) {
      this.stopStreamTracks(candidate);
      throw new Error('Microphone switch was superseded');
    }
    const previous = this.micStream;
    try {
      this.graph.disconnectMicrophoneStream();
      this.graph.connectMicrophoneStream(candidate, resolveMicrophoneGain(settings));
      this.micStream = candidate;
      this.stopStreamTracks(previous);
    } catch (error) {
      this.stopStreamTracks(candidate);
      if (previous) {
        this.graph.connectMicrophoneStream(previous, resolveMicrophoneGain(settings));
      }
      this.micStream = previous;
      throw error;
    }
  }

  removeMicrophone(): void {
    this.releaseMicrophoneStream();
    logger.log('Microphone removed');
  }

  setMicrophoneEnabled(enabled: boolean): void {
    this.micStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  hasMicrophone(): boolean {
    return this.micStream !== null;
  }

  getMixedStream(): MediaStream {
    return this.graph.getMixedStream();
  }

  hasAudio(): boolean {
    return this.graph.hasAudio();
  }

  async cleanup(): Promise<void> {
    this.releaseTabStream();
    this.releaseMicrophoneStream();
    await this.graph.cleanup();
    logger.log('Cleaned up');
  }
}

type MicrophoneMixerSettings = Pick<
  VideoRecordingSettings,
  | 'autoGainControl'
  | 'echoCancellation'
  | 'microphoneDeviceId'
  | 'microphoneGain'
  | 'noiseSuppression'
>;

function normalizeMicrophoneMixerSettings(
  settingsOrDeviceId?: MicrophoneMixerSettings | string | null
): MicrophoneMixerSettings {
  if (
    typeof settingsOrDeviceId === 'object' &&
    settingsOrDeviceId !== null &&
    'microphoneDeviceId' in settingsOrDeviceId
  ) {
    return settingsOrDeviceId;
  }

  return {
    microphoneDeviceId: settingsOrDeviceId ?? null,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    microphoneGain: 1,
  };
}
