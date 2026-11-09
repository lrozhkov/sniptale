import {
  BufferTarget,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
  VideoSample,
  VideoSampleSource,
  canEncodeVideo,
} from 'mediabunny';

import { isVideoPreviewCacheCodec } from '../../../composition/persistence/video-preview-cache';

interface EncodedVideoPreview {
  blob: Blob;
  codec: string;
}

const PERSISTENT_PREVIEW_ENCODER_POLICY = {
  hardwareAcceleration: 'no-preference',
  latencyMode: 'realtime',
} as const;

export async function canEncodePersistentVideoPreview(
  width: number,
  height: number
): Promise<boolean> {
  return canEncodeVideo('avc', {
    bitrate: QUALITY_MEDIUM,
    height,
    width,
    ...PERSISTENT_PREVIEW_ENCODER_POLICY,
  });
}

export async function encodePersistentVideoPreview(params: {
  canvas: HTMLCanvasElement;
  endFrame: number;
  fps: number;
  /** Transfers the returned canvas resource until encoding of this frame settles. */
  onFrame: (frameIndex: number) => Promise<void | { canvas: HTMLCanvasElement; release(): void }>;
  signal: AbortSignal;
  startFrame: number;
}): Promise<EncodedVideoPreview> {
  const target = new BufferTarget();
  const encoderCodecs = new Set<string>();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 0.5 }),
    target,
  });
  const source = new VideoSampleSource({
    bitrate: QUALITY_MEDIUM,
    codec: 'avc',
    ...PERSISTENT_PREVIEW_ENCODER_POLICY,
    keyFrameInterval: 0.5,
    onEncoderConfig: (config) => encoderCodecs.add(config.codec),
  });
  output.addVideoTrack(source);
  await output.start();
  try {
    for (let frameIndex = params.startFrame; frameIndex < params.endFrame; frameIndex += 1) {
      if (params.signal.aborted)
        throw new DOMException('Preview encoding was cancelled', 'AbortError');
      const frame = await params.onFrame(frameIndex);
      let sample: VideoSample | undefined;
      try {
        if (params.signal.aborted)
          throw new DOMException('Preview encoding was cancelled', 'AbortError');
        const relativeFrame = frameIndex - params.startFrame;
        sample = new VideoSample(frame?.canvas ?? params.canvas, {
          timestamp: relativeFrame / params.fps,
          duration: 1 / params.fps,
        });
        await source.add(sample, {
          keyFrame: relativeFrame % Math.max(1, Math.round(params.fps * 0.5)) === 0,
        });
        if (params.signal.aborted)
          throw new DOMException('Preview encoding was cancelled', 'AbortError');
      } finally {
        try {
          sample?.close();
        } finally {
          frame?.release();
        }
      }
    }
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }
  const buffer = target.buffer;
  if (!buffer) throw new Error('Video preview encoder produced no output');
  const [codec] = encoderCodecs;
  if (encoderCodecs.size !== 1 || !isVideoPreviewCacheCodec(codec)) {
    throw new Error('Video preview encoder produced an unsupported codec identity');
  }
  return {
    blob: new Blob([buffer], { type: 'video/mp4' }),
    codec,
  };
}
