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
  private tabStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;

  private stopStreamTracks(stream: MediaStream | null): void {
    stream?.getTracks().forEach((track) => track.stop());
  }

  private releaseTabStream(): void {
    this.graph.disconnectTabStream();
    this.stopStreamTracks(this.tabStream);
    this.tabStream = null;
  }

  private releaseMicrophoneStream(): void {
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
    this.tabStream = audioOnlyStream;
    this.graph.connectTabStream(audioOnlyStream);

    logger.log('Tab audio added');
  }

  async addMicrophone(settingsOrDeviceId?: MicrophoneMixerSettings | string | null): Promise<void> {
    await this.initialize();

    try {
      this.releaseMicrophoneStream();
      const settings = normalizeMicrophoneMixerSettings(settingsOrDeviceId);
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: buildMicrophoneAudioConstraints(settings),
      });

      const microphoneStream = this.micStream;
      if (!microphoneStream) {
        throw new Error('Microphone stream was not initialized');
      }

      this.graph.connectMicrophoneStream(microphoneStream, resolveMicrophoneGain(settings));

      logger.log('Microphone added');
    } catch (error) {
      this.releaseMicrophoneStream();
      logger.error('Failed to add microphone', error);
      throw new Error(translate('popup.video.microphoneAccessError'));
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
