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

  const frame = new VideoFrame(canvas, {
    timestamp: timestampOffsetUs + frameIndex * frameDurationUs,
    duration: frameDurationUs,
  });
  try {
    await waitForEncoderQueueCapacityFrame(videoEncoder, MP4_QUEUE_CAPACITY, signal);
    videoEncoder.encode(frame, {
      keyFrame: frameIndex === 0 || frameIndex % keyframeInterval === 0,
    });
  } finally {
    frame.close();
  }
}
