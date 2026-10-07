import { getProjectExportFrameOptions } from '../../../../../features/video/project/export/encoding-quality';
import { waitForEncoderQueueCapacity } from '../../../codecs';
import type { RenderFrameDrivenCompositeFrameArgs } from './types';

const MP4_QUEUE_CAPACITY = 6;

type WaitForEncoderQueueCapacity = (
  encoder: VideoEncoder,
  queueCapacity: number,
  signal?: AbortSignal
) => Promise<void>;

const waitForEncoderQueueCapacityFrame = waitForEncoderQueueCapacity as WaitForEncoderQueueCapacity;

export async function encodeFrameDrivenCompositeFrame(
  args: RenderFrameDrivenCompositeFrameArgs
): Promise<void> {
  const {
    canvas,
    frameDurationUs,
    frameIndex,
    keyframeInterval,
    signal,
    timestampOffsetUs = 0,
    videoEncoder,
  } = args;

  const timestamp = args.frameTimestampUs ?? timestampOffsetUs + frameIndex * frameDurationUs;
  if (args.adaptiveFrameWriter) {
    await args.adaptiveFrameWriter.add(timestamp, frameDurationUs);
    return;
  }
  await encodeCompositeCanvasFrame({
    canvas,
    timestamp,
    duration: frameDurationUs,
    keyFrame: frameIndex === 0 || frameIndex % keyframeInterval === 0,
    settings: args.settings,
    videoEncoder,
    ...(signal === undefined ? {} : { signal }),
  });
}

export async function encodeCompositeCanvasFrame(args: {
  canvas: HTMLCanvasElement;
  timestamp: number;
  duration: number;
  keyFrame: boolean;
  settings: RenderFrameDrivenCompositeFrameArgs['settings'];
  videoEncoder: VideoEncoder;
  signal?: AbortSignal;
}): Promise<void> {
  const frame = new VideoFrame(args.canvas, {
    timestamp: args.timestamp,
    duration: args.duration,
  });
  try {
    await waitForEncoderQueueCapacityFrame(args.videoEncoder, MP4_QUEUE_CAPACITY, args.signal);
    args.signal?.throwIfAborted();
    args.videoEncoder.encode(frame, {
      ...getProjectExportFrameOptions(args.settings),
      keyFrame: args.keyFrame,
    });
  } finally {
    frame.close();
  }
}
