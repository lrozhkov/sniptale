import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import { cameraContentFrame } from '../../features/video/project/camera/appearance';
import { traceCameraShape } from '../../features/video/composition/draw/media-shadow';
import {
  quickEditWebcamFrameAt,
  type QuickEditWebcam,
  type QuickEditWebcamPlacement,
} from '../../features/video/review/advanced/webcam';
import { createReviewDecodedSampleSink } from './decoded-video-sample';
import { QuickEditExportUnavailable } from './export-unavailable';

type Size = { width: number; height: number };
type WebcamDrawable = {
  draw(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;
};

/** Inspect a bounded packet prefix before the first native seek; no frames are decoded. */
export async function inspectReviewWebcamFrameDuration(
  blob: Blob,
  signal: AbortSignal
): Promise<number> {
  signal.throwIfAborted();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const abort = () => input.dispose();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Camera video track is missing.');
    const stats = await track.computePacketStats(60, { metadataOnly: true });
    signal.throwIfAborted();
    if (!Number.isFinite(stats.averagePacketRate) || stats.averagePacketRate <= 0)
      throw new Error('Camera frame cadence is invalid.');
    return Math.max(1 / 120, 1 / stats.averagePacketRate);
  } finally {
    signal.removeEventListener('abort', abort);
    input.dispose();
  }
}

/** One crop, silhouette and mirror adapter for native live video and decoded export frames. */
export function drawReviewWebcam(
  context: CanvasRenderingContext2D,
  output: Size,
  webcam: QuickEditWebcam,
  placement: QuickEditWebcamPlacement,
  source: Size,
  drawable: WebcamDrawable
): void {
  const width = placement.width * output.width;
  const height = placement.height * output.height;
  const crop = cameraContentFrame(width, height, source.width, source.height, webcam.appearance);
  context.save();
  try {
    context.translate(placement.x * output.width, placement.y * output.height);
    traceCameraShape(context, { x: 0, y: 0, width, height }, webcam.appearance);
    context.clip();
    if (webcam.mirrored) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    drawable.draw(context, crop.x, crop.y, crop.width, crop.height);
  } finally {
    context.restore();
  }
}

interface ReviewWebcamRenderFrame {
  draw(context: CanvasRenderingContext2D, output: Size): void;
}

/**
 * One export-only decoder, with at most one yielded sample retained. Each window
 * streams camera timestamps in source order; skipped/hidden times are never decoded.
 */
export async function createReviewWebcamRenderer(
  webcam: QuickEditWebcam,
  readAsset: (assetId: string) => Promise<Blob | null>,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const blob = await readAsset(webcam.assetId);
  signal.throwIfAborted();
  if (!blob) throw new QuickEditExportUnavailable(['asset-missing']);
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const dispose = () => input.dispose();
  signal.addEventListener('abort', dispose, { once: true });
  const release = () => {
    signal.removeEventListener('abort', dispose);
    dispose();
  };
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw new QuickEditExportUnavailable(['asset-missing']);
    const duration = (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    const source = { width: await track.getDisplayWidth(), height: await track.getDisplayHeight() };
    const resolution = await track.getTimeResolution();
    if (
      ![duration, source.width, source.height, resolution].every(
        (value) => Number.isFinite(value) && value > 0
      )
    )
      throw new QuickEditExportUnavailable(['asset-missing']);
    signal.throwIfAborted();
    const sink = createReviewDecodedSampleSink(new VideoSampleSink(track), signal);
    return {
      dispose: release,
      async *frames(
        sourceTimes: readonly number[]
      ): AsyncGenerator<ReviewWebcamRenderFrame | null> {
        const frames = sourceTimes.map((time) => quickEditWebcamFrameAt(webcam, time, duration));
        const lastTick = (Math.ceil(duration * resolution) - 1) / resolution;
        const timestamps = frames.flatMap((frame) =>
          frame ? [Math.min(lastTick, Math.round(frame.time * resolution) / resolution)] : []
        );
        const decoded = sink.samplesAtTimestamps(timestamps);
        try {
          for (const frame of frames) {
            signal.throwIfAborted();
            if (!frame) {
              yield null;
              continue;
            }
            const next = await decoded.next();
            const sample = next.value;
            if (!sample) throw new QuickEditExportUnavailable(['asset-missing']);
            try {
              signal.throwIfAborted();
              yield {
                draw: (context, output) =>
                  drawReviewWebcam(context, output, webcam, frame.placement, source, sample),
              };
            } finally {
              sample.close();
            }
          }
        } finally {
          await decoded.return(undefined);
        }
      },
    };
  } catch (error) {
    release();
    signal.throwIfAborted();
    throw error instanceof QuickEditExportUnavailable
      ? error
      : new QuickEditExportUnavailable(['asset-missing']);
  }
}
