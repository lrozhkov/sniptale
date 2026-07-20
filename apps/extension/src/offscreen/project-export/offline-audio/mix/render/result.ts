import type { ExportAudioSettings } from '../../../codecs/types';

export function buildOfflineAudioMixResult(renderedBuffer: AudioBuffer): {
  buffer: AudioBuffer;
  settings: ExportAudioSettings;
} {
  return {
    buffer: renderedBuffer,
    settings: {
      numberOfChannels: renderedBuffer.numberOfChannels,
      sampleRate: renderedBuffer.sampleRate,
    },
  };
}
