import { ownReviewOutputCancellation } from './render-output-lifetime';
import { paintReviewExportScene, type ReviewRenderScene } from './render-export-scene';
import type { ReviewFrameExportInput } from './render-export-input';
import { hasCameraPerspective as hasQuickEditPerspective } from '../../features/video/project/motion/spatial';
import { writeReviewPresentationFrames } from './render-presentation-export';
import type { createReviewPresentationMain } from './presentation-main';
import type { WatermarkRenderer } from '../../features/video/composition/canvas/watermark';
import type { ReviewKeyCue } from '../../features/video/review/key-animation';
import { drawReviewKeys } from './render-key-animation';
import { quickEditFocusType } from '../../features/video/review/advanced/focus-layout';
import { createReviewSpatialRenderer } from '../../features/video/composition/canvas/spatial-renderer';
import {
  createAdaptiveFrameWriter,
  createAdaptiveComparisonBudget,
} from '../../features/video/project/export/adaptive-frames';
import { hasQuickEditMotionBlur } from '../../features/video/review/advanced/motion-blur';
import { createReviewRenderTimeTracking } from './time-estimate-plan';
import type { ReviewFrameWindow } from './render-schedule';
import type { createReviewWebcamRenderer } from './render-webcam';
import { createReviewDecodedSampleSink } from './decoded-video-sample';
import { loadReviewWindowHeader, reviewWindowHeaderUrl } from './window-header';
import {
  planReviewCutTransitions,
  reviewCutTransitionAt,
  type ReviewCutTransitionPlan,
} from '../../features/video/review/cuts';
import {
  type ReviewTransitionSample,
  createReviewTransitionFrames,
  paintReviewCutTransition,
  paintReviewCutDissolve,
  reviewCutTransitionSides,
  paintReviewCutBlackout,
} from './cut-transition-frames';
import {
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
  Input,
  VideoSample,
  VideoSampleSink,
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
import type { prepareReviewFinalCaptions } from './render-captions';
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
  let transitionFrames: ReturnType<typeof createReviewTransitionFrames> | null = null;
  let webcam: Awaited<ReturnType<typeof createReviewWebcamRenderer>> | null = null;
  let watermark: WatermarkRenderer | null = null;
  let main: Awaited<ReturnType<typeof createReviewPresentationMain>> | null = null;
  try {
    source = await reviewExportPhase(args.signal, 'decode', () =>
      openReviewRenderSource(args, input, preparation)
    );
    const decorations = await reviewExportPhase(args.signal, 'compose', () =>
      prepareReviewFrameDecorations(args, preparation, source!)
    );
    main = decorations.main;
    watermark = decorations.watermark;
    webcam = decorations.webcam;
    const captions = decorations.captions;
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
    const frameSink = main
      ? null
      : createReviewDecodedSampleSink(
          new VideoSampleSink(source.video),
          args.signal,
          await source.video.getDecoderConfig()
        );
    const transitions = planReviewCutTransitions(args.index.duration, args.edits);
    if (!main && transitions.length)
      transitionFrames = createReviewTransitionFrames(
        createReviewDecodedSampleSink(
          new VideoSampleSink(source.video),
          args.signal,
          await source.video.getDecoderConfig()
        ),
        args.signal
      );
    const sourceTimeResolution = await source.video.getTimeResolution();
    const timeTracking = createReviewRenderTimeTracking(
      {
        duration: receipt.resultDuration,
        fragmentOffset: args.fragmentOffset,
        zoomRegions: preparation.effective.zoomRegions,
        transitions,
        webcam: !!webcam,
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
      if (main) {
        const composedMain = main;
        receipt.videoPackets += await reviewExportPhase(args.signal, 'compose', () =>
          renderAnnotationWindow({
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
        continue;
      }
      const visual = source.visual;
      if (!visual || !frameSink) throw new Error('Legacy render source is unavailable.');
      const renderSource = source;
      receipt.videoPackets += await reviewExportPhase(args.signal, 'compose', () =>
        renderRenderWindowFrames({
          window,
          adaptiveBudget,
          adaptive: !args.frameProbe && args.renderSettings?.frameRateMode === 'adaptive',
          fps: preparation.fps,
          fragmentOffset: args.fragmentOffset,
          zoomRegions: preparation.effective.zoomRegions,
          background: preparation.effective.background,
          keyCues: args.keyCues,
          clickCues: args.clickCues,
          comments: args.comments ?? [],
          canvas: visual.canvas,
          sourceSize: renderSource.sourceSize,
          sceneScale: renderSource.sceneScale,
          baseCanvas: renderSource.baseCanvas,
          windowHeader: preparation.effective.windowHeader,
          headerImage: visual.headerImage,
          context: visual.context,
          image: visual.image,
          frameSink,
          sourceTimeResolution,
          transitions,
          transitionFrames,
          webcam,
          watermark,
          ...(captions ? { captions } : {}),
          videoOut,
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
    args.onTimeEstimate?.(null);
    webcam?.dispose();
    watermark?.dispose();
    transitionFrames?.dispose();
    main?.dispose();
    source?.visual?.image?.close();
    source?.visual?.headerImage?.close();
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
  sceneScale: number;
  baseCanvas: { width: number; height: number };
  sourceSize: { width: number; height: number };
  dimensions: Parameters<typeof createReviewPresentationMain>[0]['dimensions'];
  visual: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    image: ImageBitmap | null;
    headerImage: ImageBitmap | null;
  } | null;
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
  const scale = scene.scale;

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
    sceneScale: scale,
    baseCanvas: scene.canvas,
    dimensions,
  };
  signal.throwIfAborted();
  if (preparation.effective.annotationEffects)
    return { ...metadata, sampleRate: audio ? await audio.getSampleRate() : 0, visual: null };
  preparation.effective.background = scene.background;
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.backing.width;
  canvas.height = dimensions.backing.height;
  const context = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
  if (!context) throw new Error('Canvas context is unavailable.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const background = preparation.effective.background;
  let backgroundImage: ImageBitmap | null = null;
  if (background.enabled && background.type === 'image') {
    if (!background.assetId) throw new QuickEditExportUnavailable(['asset-missing']);
    const blob = await args.readProjectAsset(background.assetId);
    signal.throwIfAborted();
    if (!blob) throw new QuickEditExportUnavailable(['asset-missing']);
    try {
      backgroundImage = await createImageBitmap(blob);
    } catch {
      throw new QuickEditExportUnavailable(['asset-missing']);
    }
  }
  try {
    return {
      ...metadata,
      sampleRate: audio ? await audio.getSampleRate() : 0,
      visual: {
        canvas,
        headerImage: preparation.effective.windowHeader
          ? await loadReviewWindowHeader(
              reviewWindowHeaderUrl(
                preparation.effective.windowHeader,
                sourceSize.width,
                sourceSize.height
              ),
              signal
            )
          : null,
        context,
        image: backgroundImage,
      },
    };
  } catch (error) {
    backgroundImage?.close();
    throw error;
  }
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
export async function renderRenderWindowFrames(
  args: ReviewRenderScene & {
    keyCues?: readonly ReviewKeyCue[] | undefined;
    window: ReviewFrameWindow;
    adaptive?: boolean;
    adaptiveBudget?: ReturnType<typeof createAdaptiveComparisonBudget>;
    fps: number;
    fragmentOffset: number;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    frameSink: Pick<VideoSampleSink, 'samplesAtTimestamps'>;
    sourceTimeResolution?: number;
    transitions?: readonly ReviewCutTransitionPlan[];
    transitionFrames?: ReturnType<typeof createReviewTransitionFrames> | null;
    webcam?: Awaited<ReturnType<typeof createReviewWebcamRenderer>> | null;
    watermark?: WatermarkRenderer | null;
    captions?: Awaited<ReturnType<typeof prepareReviewFinalCaptions>>;
    videoOut: { add(sample: VideoSample): Promise<void>; close(): void };
    resultDuration: number;
    onProgress: ((fraction: number) => void) | undefined;
    signal: AbortSignal;
  }
): Promise<number> {
  const { window, fps, canvas, context, videoOut, signal } = args;
  // Stage normalized source pixels once before camera filtering and transition composition.
  const raster = document.createElement('canvas');
  raster.width = args.sourceSize.width;
  raster.height = args.sourceSize.height;
  const rasterContext = raster.getContext('2d', { alpha: false, colorSpace: 'srgb' });
  if (!rasterContext) throw new Error('Canvas context is unavailable.');
  rasterContext.imageSmoothingEnabled = false;

  const scratch = args.zoomRegions.some((region) => region.spotlight?.effect === 'blur')
    ? document.createElement('canvas')
    : null;
  if (scratch) {
    scratch.width = canvas.width;
    scratch.height = canvas.height;
  }
  // Container ticks can round a frame PTS above its ideal CFR time (e.g. 2/30 → .067).
  // Quantize lookups to that clock, but never sample a frame belonging to the next edit.
  const resolution = args.sourceTimeResolution ?? 1_000_000;
  const lastTick = (Math.ceil(window.segment.sourceEnd * resolution) - 1) / resolution;
  const sampleTimes = window.sourceTimes.map((time) =>
    Math.min(lastTick, Math.round(time * resolution) / resolution)
  );
  const blurEnabled = hasQuickEditMotionBlur(args.zoomRegions);
  const spatialRenderer = args.zoomRegions.some(
    (r) =>
      !r.dormant &&
      quickEditFocusType(r) === 'zoom' &&
      (hasQuickEditPerspective(r.perspective) || r.depthOfField?.enabled)
  )
    ? createReviewSpatialRenderer()
    : undefined;
  let dissolve: HTMLCanvasElement | undefined;
  let frame = 0;
  const writer = createReviewFrameWriter({
    canvas,
    context,
    videoOut,
    signal,
    adaptive: args.adaptive,
    adaptiveBudget: args.adaptiveBudget,
  });
  const webcamFrames = args.webcam?.frames(window.sourceTimes);
  try {
    for await (const sample of args.frameSink.samplesAtTimestamps(sampleTimes)) {
      if (!sample) {
        signal.throwIfAborted();
        throw new Error('Source frame is unavailable.');
      }
      const timestamp = window.timestamps[frame]!;
      try {
        signal.throwIfAborted();
        const blend = reviewCutTransitionAt(timestamp, args.transitions ?? []);
        const draw = (
          context: CanvasRenderingContext2D,
          canvas: HTMLCanvasElement,
          sample: Pick<ReviewTransitionSample, 'draw'>,
          resultTime: number,
          sourceTime: number
        ) =>
          paintReviewExportScene({
            scene: args,
            context,
            canvas,
            sample,
            resultTime,
            sourceTime,
            spatialRenderer,
            scratch,
            blurEnabled,
          });
        if (blend?.plan.type === 'dissolve') {
          const endpoints = await args.transitionFrames?.load(blend.plan);
          signal.throwIfAborted();
          if (!endpoints) throw new QuickEditExportUnavailable(['transition-frames']);
          const sides = reviewCutTransitionSides(
            blend,
            endpoints,
            sample,
            timestamp + args.fragmentOffset,
            args.fragmentOffset
          );
          dissolve ??= document.createElement('canvas');
          dissolve.width = canvas.width;
          dissolve.height = canvas.height;
          const dissolveContext = dissolve.getContext('2d');
          if (!dissolveContext) throw new Error('Canvas context is unavailable.');
          paintReviewCutDissolve(
            context,
            { canvas: dissolve, context: dissolveContext },
            blend.incoming,
            (target, surface, side) => {
              const endpoint = sides[side];
              draw(
                target,
                surface,
                { draw: endpoint.sample.draw.bind(endpoint.sample) },
                endpoint.resultTime,
                endpoint.sample.timestamp
              );
            },
            canvas
          );
        } else {
          if (blend) {
            const endpoints = await args.transitionFrames?.load(blend.plan);
            signal.throwIfAborted();
            if (!endpoints) throw new QuickEditExportUnavailable(['transition-frames']);
            paintReviewCutTransition(rasterContext, raster, blend, endpoints, sample);
          } else sample.draw(rasterContext, 0, 0, raster.width, raster.height);
          draw(
            context,
            canvas,
            {
              draw: (target, x, y, width, height) => target.drawImage(raster, x, y, width, height),
            },
            timestamp + args.fragmentOffset,
            window.sourceTimes[frame] ?? window.segment.sourceStart
          );
        }
        if (webcamFrames) {
          const cameraFrame = await webcamFrames.next();
          signal.throwIfAborted();
          if (cameraFrame.done) throw new QuickEditExportUnavailable(['asset-missing']);
          cameraFrame.value?.draw(context, canvas);
        }
        drawReviewKeys(context, args.keyCues ?? [], timestamp + args.fragmentOffset, canvas);
        args.watermark?.draw(context);
        args.captions?.draw(context, timestamp + args.fragmentOffset);
        paintReviewCutBlackout(context, canvas, blend);
        await writer.add(
          timestamp,
          Math.min(window.segment.resultEnd, window.timestamps[frame + 1] ?? timestamp + 1 / fps),
          Math.min(1 / fps, window.segment.resultEnd - timestamp)
        );
      } finally {
        sample.close();
      }
      args.onProgress?.(Math.min(1, (timestamp + 1 / fps) / args.resultDuration));
      frame++;
    }
    await writer.flush();
  } finally {
    spatialRenderer?.dispose();
    writer.dispose();
    await webcamFrames?.return(undefined);
  }
  return writer.count();
}

/** Shared scene output preserves ordinary window timestamps and audio draining. */
async function renderAnnotationWindow(args: {
  window: ReviewFrameWindow;
  main: Awaited<ReturnType<typeof createReviewPresentationMain>>;
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
