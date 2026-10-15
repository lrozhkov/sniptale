import type { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { resolveVideoTargetBitrate } from '@sniptale/runtime-contracts/video/types/types';
import { resolveVideoCodecLevel } from '../../features/video/project/export/codec-level';
import {
  getVideoExportConfigCandidates,
  getVideoExportQuantizer,
  supportsVideoExportConfig,
} from '../../features/video/project/export/encoding-quality';
import {
  projectVideoExportSize,
  normalizeVideoExportSample,
  type VideoExportSampleWindow,
} from '../../features/video/project/export/size-estimate';

interface VideoExportSizeProfile {
  codec: 'avc' | 'hevc' | 'vp8' | 'vp9';
  width: number;
  height: number;
  fps: number;
  quality: VideoQuality;
}

/** Encodes disposable rendered samples; never writes output bytes or owns source assets. */
export async function measureVideoExportSize(args: {
  profile: VideoExportSizeProfile;
  windows: readonly VideoExportSampleWindow[];
  duration: number;
  audioBitrate: number;
  signal: AbortSignal;
  render(encode: (frame: VideoFrame) => Promise<void>): Promise<void>;
}) {
  const { profile, signal } = args;
  signal.throwIfAborted();
  const codec = resolveVideoCodecLevel(
    { avc: 'avc1.640028', hevc: 'hvc1.1.6.L123.B0', vp8: 'vp8', vp9: 'vp09.00.10.08' }[
      profile.codec
    ],
    profile
  );
  const base: VideoEncoderConfig = {
    codec,
    width: profile.width,
    height: profile.height,
    framerate: profile.fps,
    bitrate: resolveVideoTargetBitrate(profile),
    bitrateMode: 'variable',
    hardwareAcceleration: 'no-preference',
    ...(profile.codec === 'avc' ? { avc: { format: 'avc' } } : {}),
  };
  let config: VideoEncoderConfig | null = null;
  for (const candidate of getVideoExportConfigCandidates(base)) {
    signal.throwIfAborted();
    try {
      if (supportsVideoExportConfig(candidate, await VideoEncoder.isConfigSupported(candidate))) {
        config = candidate;
        break;
      }
    } catch {
      signal.throwIfAborted();
    }
  }
  if (!config) throw new Error('Size estimate encoder unavailable');
  const samples = args.windows.map(() => ({
    bytes: 0,
    seconds: 0,
    frames: 0,
    keyFrames: 0,
    keyBytes: 0,
  }));
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output(chunk) {
      const index = args.windows.findIndex(
        (window) =>
          chunk.timestamp / 1e6 >= window.start - 1e-6 && chunk.timestamp / 1e6 < window.end
      );
      if (index >= 0) {
        const sample = samples[index]!;
        sample.bytes += chunk.byteLength;
        sample.frames++;
        if (chunk.type === 'key') {
          sample.keyFrames++;
          sample.keyBytes += chunk.byteLength;
        }
      }
    },
    error(error) {
      failure = error;
    },
  });
  const abort = () => {
    if (encoder.state !== 'closed') encoder.close();
  };
  signal.addEventListener('abort', abort, { once: true });
  let frames = 0;
  let previousTime = -Infinity;
  const quantizer = getVideoExportQuantizer(profile.codec, profile.quality);
  const options: VideoEncoderEncodeOptions =
    quantizer === null
      ? {}
      : profile.codec === 'hevc'
        ? { hevc: { quantizer } }
        : profile.codec === 'vp9'
          ? { vp9: { quantizer } }
          : { avc: { quantizer } };
  try {
    signal.throwIfAborted();
    encoder.configure(config);
    await args.render(async (frame) => {
      signal.throwIfAborted();
      if (failure) throw failure;
      if (frame.displayWidth !== profile.width || frame.displayHeight !== profile.height)
        throw new Error('Sample dimensions changed');
      const time = frame.timestamp / 1e6;
      const index = args.windows.findIndex(
        (window) => time >= window.start - 1e-6 && time < window.end
      );
      if (index < 0) throw new Error('Sample outside export window');
      samples[index]!.seconds += Math.min(
        (frame.duration ?? 1e6 / profile.fps) / 1e6,
        args.windows[index]!.end - time
      );
      encoder.encode(frame, {
        ...options,
        keyFrame:
          time - previousTime > 2 / profile.fps ||
          frames % Math.max(1, Math.round(profile.fps * 2)) === 0,
      });
      previousTime = time;
      frames++;
      if (encoder.encodeQueueSize >= 4) await waitForSampleEncoder(encoder, signal);
      if (frames % 8 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await encoder.flush();
    signal.throwIfAborted();
    if (failure) throw failure;
    return projectVideoExportSize(
      samples.map((sample) => normalizeVideoExportSample(sample, profile.fps, args.duration)),
      args.duration,
      args.audioBitrate
    );
  } finally {
    signal.removeEventListener('abort', abort);
    if (encoder.state !== 'closed') encoder.close();
  }
}

/** Backpressure does not flush between samples, which could change the encoder's GOP behavior. */
function waitForSampleEncoder(encoder: VideoEncoder, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      encoder.removeEventListener('dequeue', check);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const check = () => {
      if (signal.aborted) abort();
      else if (encoder.state === 'closed') {
        cleanup();
        reject(new Error('Encoder closed'));
      } else if (encoder.encodeQueueSize < 4) {
        cleanup();
        resolve();
      }
    };
    encoder.addEventListener('dequeue', check);
    signal.addEventListener('abort', abort, { once: true });
    check();
  });
}
