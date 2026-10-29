import { VideoSample } from 'mediabunny';
import {
  createAdaptiveComparisonBudget,
  createAdaptiveFrameWriter,
} from '../../features/video/project/export/adaptive-frames';
import type { PresentationPreviewWindow } from '../../features/video/review/presentation-preview';
import type { VideoExportSampleWindow } from '../../features/video/project/export/size-estimate';
import {
  iteratePresentationCandidates,
  type PresentationSequencePlan,
} from '../../features/video/review/presentation-sequence';
import type { createReviewPresentationRenderer } from './presentation-render';

/** Drains composed frames on the frozen sequence clock; both renderer and output remain borrowed. */
export async function renderPresentationVideo(args: {
  plan: PresentationSequencePlan;
  renderer: Pick<Awaited<ReturnType<typeof createReviewPresentationRenderer>>, 'render'>;
  output: { add(sample: VideoSample): Promise<void> };
  signal: AbortSignal;
  adaptive?: boolean;
  windows?: readonly VideoExportSampleWindow[];
  window?: PresentationPreviewWindow;
  onProgress?(fraction: number): void;
}): Promise<number> {
  const budget = createAdaptiveComparisonBudget();
  let adaptive: ReturnType<typeof createAdaptiveFrameWriter> | null = null;
  let context: CanvasRenderingContext2D | null = null;
  let count = 0;
  const emit = async (
    source: HTMLCanvasElement | VideoFrame,
    timeUs: number,
    durationUs: number
  ) => {
    let sample: VideoSample | null = null;
    try {
      args.signal.throwIfAborted();
      sample = new VideoSample(source, {
        timestamp: timeUs / 1_000_000,
        duration: durationUs / 1_000_000,
      });
      await args.output.add(sample);
      args.signal.throwIfAborted();
      count++;
    } finally {
      if (sample) sample.close();
      else if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) source.close();
    }
  };
  try {
    for (const { candidate, timestampUs, durationUs } of iteratePresentationVideoFrames(
      args.plan,
      args
    )) {
      args.signal.throwIfAborted();
      const frame = await args.renderer.render(candidate);
      try {
        args.signal.throwIfAborted();
        if (args.adaptive) {
          if (context !== frame.context) {
            await adaptive?.flush();
            adaptive?.dispose();
            context = frame.context;
            adaptive = createAdaptiveFrameWriter(
              context,
              (native, start, duration) => emit(native.clone(), start, duration),
              args.signal,
              budget
            );
          }
          // Endpoint candidates remain individual frames, even on a completely static canvas.
          if (candidate.retainEndpoint) await adaptive!.flush();
          await adaptive!.add(timestampUs, durationUs);
          if (candidate.retainEndpoint) await adaptive!.flush();
        } else await emit(frame.canvas, timestampUs, durationUs);
      } finally {
        frame.release();
      }
      args.onProgress?.(
        (timestampUs + durationUs) /
          (args.window ? args.window.endUs - args.window.startUs : args.plan.totalDurationUs)
      );
    }
    await adaptive?.flush();
    return count;
  } finally {
    adaptive?.dispose();
  }
}

/** One lazy lattice selection feeds rendering and decoder admission, including sparse probes. */
export function* iteratePresentationVideoFrames(
  plan: PresentationSequencePlan,
  selection: {
    window?: PresentationPreviewWindow | undefined;
    windows?: readonly VideoExportSampleWindow[] | undefined;
  } = {}
) {
  const frames = selection.window
    ? presentationPreviewFrames(plan, selection.window)
    : (function* () {
        for (const candidate of iteratePresentationCandidates(plan))
          yield { candidate, timestampUs: candidate.timestampUs, durationUs: candidate.durationUs };
      })();
  for (const frame of frames) {
    if (
      selection.windows &&
      !selection.windows.some(
        (window) =>
          frame.candidate.timestampUs >= window.start * 1_000_000 &&
          frame.candidate.timestampUs < window.end * 1_000_000
      )
    )
      continue;
    yield frame;
  }
}

/** Validate bounded derived data against the original plan before opening any frame lease. */
export function presentationPreviewFrames(
  plan: PresentationSequencePlan,
  window: PresentationPreviewWindow
) {
  if (
    ![window.startUs, window.endUs].every(Number.isSafeInteger) ||
    window.startUs < 0 ||
    window.endUs <= window.startUs ||
    window.endUs > plan.totalDurationUs ||
    window.endUs - window.startUs > 4_000_000 ||
    !window.frames.length ||
    window.frames.length > 122
  )
    throw new Error('Invalid presentation preview window');
  let end = 0;
  let previousTick = -1;
  const frames = window.frames.map((frame) => {
    const candidate = [
      ...iteratePresentationCandidates(plan, { startTick: frame.tick, endTick: frame.tick + 1 }),
    ][0]!;
    if (
      frame.tick <= previousTick ||
      candidate.timestampUs !== frame.sequenceTimeUs ||
      candidate.durationUs !== frame.sequenceDurationUs ||
      frame.containerTimeUs !== candidate.timestampUs - window.startUs ||
      frame.containerTimeUs !== end ||
      !Number.isSafeInteger(frame.durationUs) ||
      frame.durationUs <= 0
    )
      throw new Error('Presentation preview candidate does not match the sequence');
    previousTick = frame.tick;
    end = frame.containerTimeUs + frame.durationUs;
    return { candidate, timestampUs: frame.containerTimeUs, durationUs: frame.durationUs };
  });
  if (
    end !== window.endUs - window.startUs ||
    window.frames.slice(0, -1).some((frame) => frame.durationUs < 33_333)
  )
    throw new Error('Invalid presentation preview cadence');
  return frames;
}
