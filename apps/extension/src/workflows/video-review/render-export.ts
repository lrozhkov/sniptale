import { ownReviewOutputCancellation } from './render-output-lifetime';
import type { ReviewFrameExportInput } from './render-export-input';
import { writeReviewPresentationFrames } from './render-presentation-export';
import type { createReviewPresentationMain } from './presentation-main';
import {
  createAdaptiveFrameWriter,
  createAdaptiveComparisonBudget,
} from '../../features/video/project/export/adaptive-frames';
import { createReviewRenderTimeTracking } from './time-estimate-plan';
import type { ReviewFrameWindow } from './render-schedule';
import { planReviewCutTransitions } from '../../features/video/review/cuts';
import {
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
  Input,
  VideoSample,
  type InputAudioTrack,
  type Output,
} from 'mediabunny';
import {
  resolveReviewRenderBitrate,
  prepareReviewRender,
  type ReviewRenderPreparation,
  resolveReviewSceneOutput,
  assertReviewCameraAdmission,
} from './render-settings';
import type { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewEdit } from '../../features/video/review/types';
import { computeQuickEditSceneSize } from '../../features/video/review/advanced/scene';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { supportedReviewVideoCodecs, type ReviewMediaIndex } from './media-index';
import type { createReviewMediaOutput } from './media-output';
import { chooseReviewAudioCodec, renderReviewAudio } from './audio-render';
import { retainedAudio, type ReviewPacketReceipt } from './packet-export';
import { QuickEditExportUnavailable } from './export-unavailable';
import type { ReviewExportClipPlan } from './audio-render';
import { createReviewAudioClipRenderer, type ReviewAudioClipRenderer } from './audio-clip-render';
import { createReviewExportSampling } from './export-source-sampling';
import { reviewExportPhase, cleanupReviewExportFailure } from './export-diagnostics';
import { prepareReviewFrameDecorations, createReviewFrameOutput } from './render-export-setup';

type Segment = ReturnType<typeof buildReviewTimeMap>[number];
type ReviewAudioOut = ReturnType<typeof createReviewMediaOutput>['audio'];

/**
 * Full frame render for pixel-changing effects: decodes source frames, draws the
 * shared scene layout (background, camera zoom), and encodes the output at the
 * probed frame rate. Audio follows the same plan as the packet path; fragment
 * ranges keep camera and audio on global output time while timestamps start at zero.
 */
export async function writeReviewFrames(
  args: ReviewFrameExportInput
): Promise<ReviewPacketReceipt> {
  assertReviewCameraAdmission(args);
  if (resolveQuickEditEffectiveState(args.advanced).presentation)
    return writeReviewPresentationFrames(args);
  const preparation = await reviewExportPhase(args.signal, 'prepare', () =>
    prepareReviewRender(args)
  );
  const input = new Input({ source: new BlobSource(args.file), formats: ALL_FORMATS });
  let output: Output | null = null;
  let outputLifetime: ReturnType<typeof ownReviewOutputCancellation> | undefined;
  const dispose = () => input.dispose();
  args.signal.addEventListener('abort', dispose, { once: true });
  const adaptiveBudget = createAdaptiveComparisonBudget();
  let source: ReviewRenderSource | null = null;
  let main: Awaited<ReturnType<typeof createReviewPresentationMain>> | null = null;
  const enhancement = createReviewExportSampling(args.renderSettings?.detailEnhancement);
  try {
    source = await reviewExportPhase(args.signal, 'decode', () =>
      openReviewRenderSource(args, input, preparation)
    );
    const decorations = await reviewExportPhase(args.signal, 'compose', () =>
      prepareReviewFrameDecorations(args, preparation, source!, enhancement ?? undefined)
    );
    main = decorations.main;
    const receipt: ReviewPacketReceipt = {
      videoPackets: 0,
      audioPackets: 0,
      resultDuration: preparation.windows.at(-1)!.segment.resultEnd,
      audioRanges: [],
      audioReencoded: !!source.processedAudio,
      outputAudioCodec: source.processedAudio ?? args.index.audioCodec,
      videoReencoded: true,
    };
    const clock = { time: 0 };
    const clipRenderer = createReviewAudioClipRenderer();
    const outputSource = source;
    const tracks = await reviewExportPhase(args.signal, 'encode', () =>
      createReviewFrameOutput(args, preparation, outputSource, (packet) => {
        receipt.audioPackets++;
        clock.time = Math.max(clock.time, packet.timestamp + packet.duration);
      })
    );
    output = tracks?.output ?? null;
    if (output) outputLifetime = ownReviewOutputCancellation(output, args.signal);
    args.signal.throwIfAborted();
    if (tracks && tracks.video.kind !== 'sample')
      throw new Error('Video output configuration changed.');
    const videoOut = args.frameProbe
      ? { add: args.frameProbe.add, close() {} }
      : tracks?.video.kind === 'sample'
        ? tracks.video.source
        : null;
    if (!videoOut) throw new Error('Video output configuration changed.');
    const audioOut = tracks?.audio ?? null;
    await reviewExportPhase(args.signal, 'encode', () => output?.start());
    const transitions = planReviewCutTransitions(args.index.duration, args.edits);
    const timeTracking = createReviewRenderTimeTracking(
      {
        duration: receipt.resultDuration,
        fragmentOffset: args.fragmentOffset,
        zoomRegions: preparation.effective.zoomRegions,
        transitions,
        webcam: !!preparation.effective.webcam,
      },
      args.frameProbe ? undefined : args.onTimeEstimate,
      args.onProgress
    );
    for (const window of preparation.windows) {
      const segment = window.segment;
      args.signal.throwIfAborted();
      timeTracking?.startAudio();
      if (!args.frameProbe)
        await drainSegmentAudio({
          segment,
          track: source.audio,
          sink: source.audioSink,
          audioOut,
          processedAudio: source.processedAudio,
          audioConfig: source.audioConfig,
          muted: segmentAudioMuted(args.edits, segment, args.exportAudio),
          exportAudio: args.exportAudio,
          clipRenderer,
          sampleRate: source.sampleRate,
          audioCodec: args.index.audioCodec,
          clock,
          receipt,
          signal: args.signal,
        });
      timeTracking?.finishAudio(segment);
      const composedMain = main;
      receipt.videoPackets += await reviewExportPhase(args.signal, 'compose', () =>
        renderSharedCompositionWindow({
          window,
          main: composedMain,
          videoOut,
          fps: preparation.fps,
          adaptive: !args.frameProbe && args.renderSettings?.frameRateMode === 'adaptive',
          adaptiveBudget,
          resultDuration: receipt.resultDuration,
          onProgress: timeTracking?.renderProgress ?? args.onProgress,
          signal: args.signal,
        })
      );
    }
    videoOut.close();
    audioOut?.source.close();
    args.signal.throwIfAborted();
    args.onTimeEstimate?.(null);
    await reviewExportPhase(args.signal, 'mux-finalize', () => output?.finalize());
    args.signal.throwIfAborted();
    receipt.resultDuration = Math.max(receipt.resultDuration, clock.time);
    args.onProgress?.(1);
    return receipt;
  } catch (error) {
    return await cleanupReviewExportFailure(error, () => outputLifetime?.cancel());
  } finally {
    if (enhancement) await enhancement.dispose();
    args.onTimeEstimate?.(null);
    main?.dispose();
    outputLifetime?.dispose();
    args.signal.removeEventListener('abort', dispose);
    input.dispose();
  }
}

/** Segment playback stays silent only for an explicit mute, never lane visibility. */
function segmentAudioMuted(
  edits: readonly ReviewEdit[],
  segment: Segment,
  exportAudio: ReviewExportClipPlan | undefined
): boolean {
  return (
    !!exportAudio?.originalMuted ||
    edits.some(
      (edit) =>
        edit.kind === 'speed' &&
        edit.start <= segment.sourceStart &&
        edit.end >= segment.sourceEnd &&
        edit.audio === 'mute'
    )
  );
}

interface ReviewRenderSource {
  video: NonNullable<Awaited<ReturnType<Input['getPrimaryVideoTrack']>>>;
  audio: InputAudioTrack | null;
  audioSink: EncodedPacketSink | null;
  audioConfig: AudioDecoderConfig | null;
  processedAudio: 'aac' | 'opus' | null;
  sampleRate: number;
  sourceSize: { width: number; height: number };
  dimensions: Parameters<typeof createReviewPresentationMain>[0]['dimensions'];
}

/** Opens the render media: verified source tracks, audio codec probe, canvas, background. */
async function openReviewRenderSource(
  args: {
    file: Blob;
    index: ReviewMediaIndex;
    signal: AbortSignal;
    exportAudio?: ReviewExportClipPlan;
    readProjectAsset(assetId: string): Promise<Blob | null>;
  },
  input: Input,
  preparation: ReviewRenderPreparation
): Promise<ReviewRenderSource> {
  const { index, signal } = args;
  const [video, audio] = await Promise.all([
    input.getPrimaryVideoTrack(),
    input.getPrimaryAudioTrack(),
  ]);
  if (!video || video.codec !== index.videoCodec || (audio?.codec ?? null) !== index.audioCodec)
    throw new Error('Source tracks changed.');
  if (!(await video.canDecode())) throw new QuickEditExportUnavailable(['video-encoder']);
  const audioConfig = (await audio?.getDecoderConfig()) ?? null;
  if (audio && !audioConfig) throw new Error('Codec configuration is unavailable.');
  const speedExists = preparation.windows.some(
    (window) => window.segment.kind === 'speed' && window.segment.rate !== 1
  );
  const processing =
    (speedExists && !!audio) ||
    !!args.exportAudio ||
    (preparation.container === 'webm' && audio?.codec === 'aac');
  const processedAudio = processing
    ? await chooseReviewAudioCodec(audio ?? null, preparation.container)
    : null;
  if (processing && !processedAudio) throw new Error('Audio processing is unavailable.');
  const sourceSize = {
    width: Math.round(await video.getDisplayWidth()),
    height: Math.round(await video.getDisplayHeight()),
  };
  const scene = resolveReviewSceneOutput(sourceSize, preparation.effective, preparation.resolution);
  if (!scene.supported) throw new QuickEditExportUnavailable(['canvas-size']);
  const canonical = computeQuickEditSceneSize({
    source: sourceSize,
    canvas: preparation.effective.canvas,
    background: preparation.effective.background,
    windowHeader: preparation.effective.windowHeader,
  });
  const dimensions = {
    canonical: { width: canonical.width, height: canonical.height },
    backing: scene.output,
  };

  const supported = await supportedReviewVideoCodecs(preparation.container, {
    ...dimensions.backing,
    fps: preparation.fps,
    bitrate: resolveReviewRenderBitrate(
      { ...dimensions.backing, fps: preparation.fps },
      preparation.quality
    ),
  });
  if (!supported.includes(preparation.codec))
    throw new QuickEditExportUnavailable(['video-encoder']);
  signal.throwIfAborted();
  const metadata = {
    video,
    audio: audio ?? null,
    audioSink: audio ? new EncodedPacketSink(audio) : null,
    audioConfig,
    processedAudio,
    sourceSize,
    dimensions,
  };
  signal.throwIfAborted();
  return { ...metadata, sampleRate: audio ? await audio.getSampleRate() : 0 };
}

/** One window's audio: processed samples or retained packets, advancing the shared clock. */
export async function drainSegmentAudio(args: {
  segment: Segment;
  track: InputAudioTrack | null;
  sink: EncodedPacketSink | null;
  audioOut: ReviewAudioOut;
  processedAudio: 'aac' | 'opus' | null;
  audioConfig: AudioDecoderConfig | null;
  muted: boolean;
  exportAudio: ReviewExportClipPlan | undefined;
  clipRenderer?: ReviewAudioClipRenderer;
  sampleRate: number;
  audioCodec: 'aac' | 'opus' | null;
  clock: { time: number };
  receipt: ReviewPacketReceipt;
  signal: AbortSignal;
}) {
  const { segment, audioOut, processedAudio, clock, receipt, signal } = args;
  signal.throwIfAborted();
  if (processedAudio) {
    if (audioOut?.kind !== 'processed') throw new Error('Audio output configuration changed.');
    await reviewExportPhase(signal, 'audio-prepare', async () => {
      for await (const sample of renderReviewAudio(
        args.track,
        segment,
        args.muted,
        signal,
        args.exportAudio,
        args.clipRenderer
      )) {
        signal.throwIfAborted();
        await reviewExportPhase(signal, 'encode', () => audioOut.source.add(sample));
        clock.time = Math.max(clock.time, sample.timestamp + sample.duration);
      }
    });
    receipt.audioRanges.push({
      sourceStart: segment.sourceStart,
      sourceEnd: segment.sourceEnd,
      resultStart: segment.resultStart,
      resultEnd: segment.resultEnd,
    });
    return;
  }
  const { sink, audioCodec } = args;
  if (sink && audioCodec && audioOut?.kind === 'copy') {
    await reviewExportPhase(signal, 'audio-prepare', async () => {
      for await (const packet of retainedAudio(
        sink,
        segment,
        clock,
        audioCodec,
        args.sampleRate,
        receipt,
        signal
      )) {
        signal.throwIfAborted();
        await reviewExportPhase(signal, 'encode', () =>
          audioOut.source.add(packet, {
            ...(args.audioConfig ? { decoderConfig: args.audioConfig } : {}),
          })
        );
        receipt.audioPackets++;
      }
    });
  }
}

/** One window's frames: draws the scene and encodes at the fps lattice; returns the count. */
/** Shared scene output preserves ordinary window timestamps and audio draining. */
export async function renderSharedCompositionWindow(args: {
  window: ReviewFrameWindow;
  main: Pick<Awaited<ReturnType<typeof createReviewPresentationMain>>, 'renderAtTime'>;
  videoOut: { add(sample: VideoSample): Promise<void> };
  fps: number;
  adaptive: boolean;
  adaptiveBudget: ReturnType<typeof createAdaptiveComparisonBudget>;
  resultDuration: number;
  onProgress: ((fraction: number) => void) | undefined;
  signal: AbortSignal;
}) {
  let writer: ReturnType<typeof createReviewFrameWriter> | undefined;
  try {
    for (const [index, timestamp] of args.window.timestamps.entries()) {
      args.signal.throwIfAborted();
      const frame = await reviewExportPhase(args.signal, 'compose', () =>
        args.main.renderAtTime(timestamp)
      );
      try {
        args.signal.throwIfAborted();
        writer ??= createReviewFrameWriter({
          canvas: frame.canvas,
          context: frame.context,
          videoOut: args.videoOut,
          signal: args.signal,
          adaptive: args.adaptive,
          adaptiveBudget: args.adaptiveBudget,
        });
        await writer.add(
          timestamp,
          Math.min(
            args.window.segment.resultEnd,
            args.window.timestamps[index + 1] ?? timestamp + 1 / args.fps
          ),
          Math.min(1 / args.fps, args.window.segment.resultEnd - timestamp),
          frame
        );
      } finally {
        frame.release();
      }
      args.onProgress?.(Math.min(1, (timestamp + 1 / args.fps) / args.resultDuration));
    }
    await writer?.flush();
    return writer?.count() ?? 0;
  } finally {
    writer?.dispose();
  }
}

/** Owns sample lifetime and optional VFR retention after scene composition is complete. */
function createReviewFrameWriter(args: {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  videoOut: { add(sample: VideoSample): Promise<void> };
  signal: AbortSignal;
  adaptive: boolean | undefined;
  adaptiveBudget: ReturnType<typeof createAdaptiveComparisonBudget> | undefined;
}) {
  let emitted = 0;
  const emit = async (
    canvas: HTMLCanvasElement | VideoFrame,
    timestamp: number,
    duration: number
  ) => {
    const sample = new VideoSample(canvas, { timestamp, duration });
    try {
      await reviewExportPhase(args.signal, 'encode', () => args.videoOut.add(sample));
      emitted++;
    } finally {
      sample.close();
    }
  };
  const createAdaptive = (context: CanvasRenderingContext2D) =>
    args.adaptive
      ? createAdaptiveFrameWriter(
          context,
          (frame, timestampUs, durationUs) =>
            emit(frame.clone(), timestampUs / 1e6, durationUs / 1e6),
          args.signal,
          args.adaptiveBudget
        )
      : null;
  let context = args.context;
  let adaptive = createAdaptive(context);
  return {
    async add(
      timestamp: number,
      end: number,
      constantDuration: number,
      frame: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } = args
    ) {
      if (frame.context !== context) {
        await adaptive?.flush();
        adaptive?.dispose();
        context = frame.context;
        adaptive = createAdaptive(context);
      }
      if (!adaptive) {
        await emit(frame.canvas, timestamp, constantDuration);
        return;
      }
      const startUs = Math.round(timestamp * 1e6);
      const endUs = Math.round(end * 1e6);
      if (endUs > startUs) await adaptive.add(startUs, endUs - startUs);
    },
    flush: () => adaptive?.flush(),
    dispose: () => adaptive?.dispose(),
    count: () => emitted,
  };
}
