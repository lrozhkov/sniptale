import { waitForEncoderQueueCapacity } from '../codecs';
import type { ExportAudioSettings } from '../codecs/types';

const OFFLINE_AUDIO_CHUNK_FRAMES = 1_024;

export async function encodeOfflineAudioBuffer(
  buffer: AudioBuffer,
  settings: ExportAudioSettings,
  audioEncoder: AudioEncoder,
  throwIfPipelineFailed: () => void,
  signal?: AbortSignal
): Promise<void> {
  const totalFrames = buffer.length;
  for (let frameOffset = 0; frameOffset < totalFrames; frameOffset += OFFLINE_AUDIO_CHUNK_FRAMES) {
    if (signal?.aborted) {
      throw new DOMException('The export was aborted.', 'AbortError');
    }

    throwIfPipelineFailed();
    const frames = Math.min(OFFLINE_AUDIO_CHUNK_FRAMES, totalFrames - frameOffset);
    const planar = new Float32Array(frames * settings.numberOfChannels);
    for (let channel = 0; channel < settings.numberOfChannels; channel += 1) {
      const source = buffer.getChannelData(channel).subarray(frameOffset, frameOffset + frames);
      planar.set(source, channel * frames);
    }

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: settings.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: settings.numberOfChannels,
      timestamp: Math.round((frameOffset / settings.sampleRate) * 1_000_000),
      data: planar,
    });

    try {
      await waitForEncoderQueueCapacity(audioEncoder, 12, signal);
      audioEncoder.encode(audioData);
    } finally {
      audioData.close();
    }
  }
}
