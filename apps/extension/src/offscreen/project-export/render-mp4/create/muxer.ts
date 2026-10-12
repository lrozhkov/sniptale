import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';
import { type VideoProjectExportSettings } from '../../../../features/video/project/types/export';
import type { Mp4MuxerLike, Mp4PipelineProfiles } from './types';

export async function buildMp4Muxer(
  profiles: Mp4PipelineProfiles,
  settings: VideoProjectExportSettings
): Promise<{ muxer: Mp4MuxerLike; target: BufferTarget }> {
  const target = new BufferTarget();
  const output = new Output({
    target,
    // Fragment sample durations preserve the final VFR hold.
    format: new Mp4OutputFormat({
      fastStart: settings.frameRateMode === 'adaptive' ? 'fragmented' : 'in-memory',
    }),
  });
  const videoSource = new EncodedVideoPacketSource(profiles.videoProfile.muxerCodec);
  output.addVideoTrack(
    videoSource,
    settings.frameRateMode === 'adaptive' ? {} : { frameRate: settings.fps }
  );
  const audioSource =
    profiles.audioProfile && profiles.mixedAudio
      ? new EncodedAudioPacketSource(profiles.audioProfile.muxerCodec)
      : null;
  if (audioSource) output.addAudioTrack(audioSource);

  try {
    await output.start();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }

  let videoOffset: number | null = null;
  let audioOffset: number | null = null;
  let writes = Promise.resolve();
  let failure: { error: unknown } | null = null;
  let closing = false;
  let cancelled = false;
  let finalizePromise: Promise<void> | null = null;
  let cancelPromise: Promise<void> | null = null;

  const enqueue = (write: () => Promise<void>) => {
    if (closing) throw new Error('MP4 output is closed');
    const operation = writes.then(() => {
      if (failure) throw failure.error;
      if (cancelled) throw new Error('PROJECT_EXPORT_CANCELLED');
      return write();
    });
    // Native encoder callbacks cannot await. Keep one ordered tail and observe every rejection.
    writes = operation.catch((error: unknown) => {
      failure ??= { error };
    });
    return operation;
  };

  const muxer: Mp4MuxerLike = {
    addVideoChunk(chunk, meta) {
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      videoOffset ??= chunk.timestamp;
      const aligned = packet.clone({ timestamp: (chunk.timestamp - videoOffset) / 1e6 });
      return enqueue(() => videoSource.add(aligned, meta));
    },
    addAudioChunk(chunk, meta) {
      if (!audioSource) throw new Error('MP4 audio track is absent');
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      audioOffset ??= chunk.timestamp;
      const aligned = packet.clone({ timestamp: (chunk.timestamp - audioOffset) / 1e6 });
      return enqueue(() => audioSource.add(aligned, meta));
    },
    finalize() {
      closing = true;
      finalizePromise ??= (async () => {
        await writes;
        if (failure) throw failure.error;
        if (cancelled) throw new Error('PROJECT_EXPORT_CANCELLED');
        await output.finalize();
      })();
      return finalizePromise;
    },
    cancel() {
      closing = true;
      cancelled = true;
      cancelPromise ??= (async () => {
        try {
          await output.cancel();
        } finally {
          await writes;
        }
      })();
      return cancelPromise;
    },
  };
  return { muxer, target };
}
