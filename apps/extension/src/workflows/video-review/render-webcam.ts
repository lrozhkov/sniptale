import { bindReviewMediaInput } from './media-input-lifetime';
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import { cameraContentFrame } from '../../features/video/project/camera/appearance';
import {
  drawMediaFrameShadow,
  traceCameraShape,
} from '../../features/video/composition/draw/media-shadow';
import {
  quickEditWebcamFrameAt,
  quickEditWebcamBounds,
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
  const releaseInput = bindReviewMediaInput(input, signal);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Camera video track is missing.');
    const stats = await track.computePacketStats(60, { metadataOnly: true });
    signal.throwIfAborted();
    if (!Number.isFinite(stats.averagePacketRate) || stats.averagePacketRate <= 0)
      throw new Error('Camera frame cadence is invalid.');
    return Math.max(1 / 120, 1 / stats.averagePacketRate);
  } finally {
    releaseInput();
  }
}

/** One crop, silhouette and mirror adapter for native live video and decoded export frames. */
export function drawReviewWebcam(
  context: CanvasRenderingContext2D,
  output: Size,
  webcam: QuickEditWebcam,
  placement: QuickEditWebcamPlacement,
  source: Size,
  drawable: WebcamDrawable,
  cropSettings?: Pick<QuickEditWebcam['appearance'], 'zoom' | 'panX' | 'panY'>
): void {
  placement = quickEditWebcamBounds(placement, output, webcam.appearance.shape);
  const appearance = {
    ...webcam.appearance,
    ...cropSettings,
  };
  const width = placement.width * output.width;
  const height = placement.height * output.height;
  const crop = cameraContentFrame(width, height, source.width, source.height, appearance);
  context.save();
  try {
    context.translate(placement.x * output.width, placement.y * output.height);
    if (webcam.shadow?.intensity) {
      drawMediaFrameShadow(
        context,
        webcam.shadow.intensity,
        undefined,
        { x: 0, y: 0, width, height },
        Math.min(output.width, output.height) / 720,
        appearance,
        true,
        webcam.shadow.color
      );
    }
    traceCameraShape(context, { x: 0, y: 0, width, height }, appearance);
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

/** Immutable decoded camera pixels; the consumer releases before requesting another frame. */
interface ReviewWebcamSourceFrame {
  allocationBytes(): number;
  representedMediaTime: number;
  source: Size;
  placement: QuickEditWebcamPlacement;
  crop?: Pick<QuickEditWebcam['appearance'], 'zoom' | 'panX' | 'panY'>;
  drawable: WebcamDrawable;
  release(): void;
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
  const leases = new Set<ReviewWebcamSourceFrame>();
  const dispose = () => {
    for (const lease of leases) lease.release();
    input.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });
  const release = () => {
    signal.removeEventListener('abort', dispose);
    dispose();
  };
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw new QuickEditExportUnavailable(['asset-missing']);
    // Container duration can describe only an initial fragment, or outlive the video track.
    const duration = await track.computeDuration();
    const source = { width: await track.getDisplayWidth(), height: await track.getDisplayHeight() };
    const resolution = await track.getTimeResolution();
    if (
      ![duration, source.width, source.height, resolution].every(
        (value) => Number.isFinite(value) && value > 0
      )
    )
      throw new QuickEditExportUnavailable(['asset-missing']);
    signal.throwIfAborted();
    const sink = createReviewDecodedSampleSink(
      new VideoSampleSink(track),
      signal,
      await track.getDecoderConfig()
    );
    async function* sourceFrames(
      sourceTimes: readonly number[]
    ): AsyncGenerator<ReviewWebcamSourceFrame | null> {
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
          let closed = false;
          const lease: ReviewWebcamSourceFrame = {
            allocationBytes: () => sample.allocationSize(),
            representedMediaTime: sample.timestamp,
            source,
            placement: frame.placement,
            ...(frame.crop ? { crop: frame.crop } : {}),
            drawable: sample,
            release() {
              if (closed) return;
              closed = true;
              leases.delete(lease);
              sample.close();
            },
          };
          leases.add(lease);
          try {
            signal.throwIfAborted();
            yield lease;
          } finally {
            lease.release();
          }
        }
      } finally {
        await decoded.return(undefined);
      }
    }
    return {
      duration,
      dispose: release,
      sourceFrames,
      async *frames(
        sourceTimes: readonly number[]
      ): AsyncGenerator<ReviewWebcamRenderFrame | null> {
        for await (const frame of sourceFrames(sourceTimes)) {
          yield frame
            ? {
                draw: (context, output) =>
                  drawReviewWebcam(
                    context,
                    output,
                    webcam,
                    frame.placement,
                    frame.source,
                    frame.drawable,
                    frame.crop
                  ),
              }
            : null;
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
