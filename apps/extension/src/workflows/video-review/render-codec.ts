import { resolveVideoCodecLevel } from '../../features/video/project/export/codec-level';
import {
  resolveVideoTargetBitrate,
  VideoQuality,
} from '@sniptale/runtime-contracts/video/types/types';

export type ReviewOutputCodec = 'avc' | 'hevc' | 'vp8' | 'vp9';

/** Uses the calibrated recording/editor ladder; compressed source size is not a fidelity budget. */
export function resolveReviewRenderBitrate(
  output: { width: number; height: number; fps: number },
  quality: VideoQuality = VideoQuality.HIGH
): number {
  return resolveVideoTargetBitrate({ ...output, quality });
}

/** Codec family plus exact frame-rate level, shared with the primary editor. */
export function resolveReviewVideoEncoderConfig(
  codec: ReviewOutputCodec,
  output: {
    width: number;
    height: number;
    fps?: number;
    bitrate?: number;
  }
): VideoEncoderConfig {
  const fps = output.fps ?? 30;
  const base = { avc: 'avc1.640028', hevc: 'hvc1.1.6.L123.B0', vp9: 'vp09.00.10.08', vp8: 'vp8' }[
    codec
  ];
  return {
    codec: resolveVideoCodecLevel(base, { ...output, fps }),
    width: output.width,
    height: output.height,
    framerate: fps,
    bitrate: output.bitrate ?? resolveReviewRenderBitrate({ ...output, fps }),
    bitrateMode: 'variable',
    latencyMode: 'quality',
    hardwareAcceleration: 'no-preference',
    ...(codec === 'avc' ? { avc: { format: 'avc' } } : {}),
  };
}
