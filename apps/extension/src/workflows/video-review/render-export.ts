import { drawReviewSceneOverlays } from './render-scene-overlays';
import { quickEditFocusType } from '../../features/video/review/advanced/focus-layout';
import { createReviewSpatialRenderer } from './spatial-renderer';
import {
  createAdaptiveFrameWriter,
  createAdaptiveComparisonBudget,
} from '../../features/video/project/export/adaptive-frames';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import { drawReviewSceneFrame } from './scene-frame';
import {
  hasQuickEditMotionBlur,
  quickEditMotionBlurCameras,
} from '../../features/video/review/advanced/motion-blur';
import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';
import { createReviewRenderTimeTracking } from './time-estimate-plan';
import { videoExportSampleWindows } from '../../features/video/project/export/size-estimate';
import { reviewRenderFrameSchedule, type ReviewFrameWindow } from './render-schedule';
import { createReviewWebcamRenderer } from './render-webcam';
import { createReviewDecodedSampleSink } from './decoded-video-sample';
import { loadReviewWindowHeader, reviewWindowHeaderUrl } from './window-header';
import {
  planReviewCutTransitions,
  reviewCutTransitionAt,
  type ReviewCutTransitionPlan,
} from '../../features/video/review/cuts';
import {
  createReviewTransitionFrames,
  paintReviewCutTransition,
  paintReviewCutBlackout,
} from './cut-transition-frames';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import type { ReviewOutputCodec, ReviewRenderSettings } from './media-index';
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
  resolveReviewSceneOutput,
  reviewOutputCodecs,
  resolveReviewVideoEncoderConfig,
} from './render-settings';
import type { SeekableAssetObjectWriter } from '../../composition/persistence/assets';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewEdit } from '../../features/video/review/types';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../features/video/review/advanced/scene';
import {
  isCanvasCommentVisibleAt,
  type CanvasCommentExport,
} from '../../features/video/review/comments';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { supportedReviewVideoCodecs, type ReviewMediaIndex } from './media-index';
import { createReviewMediaOutput } from './media-output';
import { chooseReviewAudioCodec, renderReviewAudio } from './audio-render';
import { retainedAudio, type ReviewPacketReceipt } from './packet-export';
import { QuickEditExportUnavailable } from './export-unavailable';
import type { ReviewExportClipPlan } from './audio-render';
import { createReviewAudioClipRenderer, type ReviewAudioClipRenderer } from './audio-clip-render';

type Segment = ReturnType<typeof buildReviewTimeMap>[number];
type ReviewAudioOut = ReturnType<typeof createReviewMediaOutput>['audio'];

/**
 * Full frame render for pixel-changing effects: decodes source frames, draws the
 * shared scene layout (background, camera zoom), and encodes the output at the
 * probed frame rate. Audio follows the same plan as the packet path; fragment
 * ranges keep camera and audio on global output time while timestamps start at zero.
 */
export async function writeReviewFrames(args: {
  clickCues?: readonly ReviewClickCue[];
  renderSettings?: ReviewRenderSettings | undefined;
  /** Read-only bounded probe sink; bypasses muxing, audio rendering and writer use. */
  frameProbe?: { add(sample: VideoSample): Promise<void> };
  file: Blob;
  index: ReviewMediaIndex;
  /** Fragment-local edits; `fragmentOffset` maps local time back to global output time. */
  edits: readonly ReviewEdit[];
  advanced: QuickEditAdvancedState;
  /** Text-resolved overlays; burning follows each comment's own renderToVideo flag. */
  comments?: readonly CanvasCommentExport[];
  fragmentOffset: number;
  writer: Pick<SeekableAssetObjectWriter, 'writeAt'>;
  signal: AbortSignal;
  provenance?: string;
  exportAudio?: ReviewExportClipPlan;
  readProjectAsset(assetId: string): Promise<Blob | null>;
  onProgress?(fraction: number): void;
  onTimeEstimate?(estimate: VideoProjectExportTimeEstimate | null): void;
}): Promise<ReviewPacketReceipt> {
  const preparation = prepareReviewRender(args);
  const input = new Input({ source: new BlobSource(args.file), formats: ALL_FORMATS });
  const dispose = () => input.dispose();
  args.signal.addEventListener('abort', dispose, { once: true });
  let output: Output | null = null;
  const adaptiveBudget = createAdaptiveComparisonBudget();
  let source: ReviewRenderSource | null = null;
  let transitionFrames: ReturnType<typeof createReviewTransitionFrames> | null = null;
  let webcam: Awaited<ReturnType<typeof createReviewWebcamRenderer>> | null = null;
  try {
    source = await openReviewRenderSource(args, input, preparation);
    if (preparation.effective.webcam)
      webcam = await createReviewWebcamRenderer(
        preparation.effective.webcam,
        args.readProjectAsset,
        args.signal
      );
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
    const tracks = args.frameProbe
      ? null
      : createReviewMediaOutput({
          index: args.index,
          container: preparation.container,
          processedAudio: source.processedAudio,
          writer: args.writer,
          signal: args.signal,
          ...(args.provenance ? { provenance: args.provenance } : {}),
          sampleVideo: {
            codec: preparation.codec,
            quality: preparation.quality,
            fullCodecString: resolveReviewVideoEncoderConfig(preparation.codec, {
              width: source.canvas.width,
              height: source.canvas.height,
              fps: preparation.fps,
            }).codec,
            frameRate: preparation.fps,
            frameRateMode: args.renderSettings?.frameRateMode,
            bitrate: resolveReviewRenderBitrate(
              {
                fps: preparation.fps,
                width: source.canvas.width,
                height: source.canvas.height,
              },
              args.renderSettings?.quality
            ),
          },
          onAudioPacket: (packet) => {
            receipt.audioPackets++;
            clock.time = Math.max(clock.time, packet.timestamp + packet.duration);
          },
        });
    output = tracks?.output ?? null;
    if (tracks && tracks.video.kind !== 'sample')
      throw new Error('Video output configuration changed.');
    const videoOut = args.frameProbe
      ? { add: args.frameProbe.add, close() {} }
      : tracks?.video.kind === 'sample'
        ? tracks.video.source
        : null;
    if (!videoOut) throw new Error('Video output configuration changed.');
    const audioOut = tracks?.audio ?? null;
    await output?.start();
    const frameSink = createReviewDecodedSampleSink(new VideoSampleSink(source.video), args.signal);
    const transitions = planReviewCutTransitions(args.index.duration, args.edits);
    if (transitions.length)
      transitionFrames = createReviewTransitionFrames(
        createReviewDecodedSampleSink(new VideoSampleSink(source.video), args.signal),
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
      receipt.videoPackets += await renderRenderWindowFrames({
        window,
        adaptiveBudget,
        adaptive: !args.frameProbe && args.renderSettings?.frameRateMode === 'adaptive',
        fps: preparation.fps,
        fragmentOffset: args.fragmentOffset,
        zoomRegions: preparation.effective.zoomRegions,
        background: preparation.effective.background,
        clickCues: args.clickCues,
        comments: args.comments ?? [],
        canvas: source.canvas,
        sourceSize: source.sourceSize,
        sceneScale: source.sceneScale,
        baseCanvas: source.baseCanvas,
        windowHeader: preparation.effective.windowHeader,
        headerImage: source.headerImage,
        context: source.context,
        image: source.image,
        frameSink,
        sourceTimeResolution,
        transitions,
        transitionFrames,
        webcam,
        videoOut,
        resultDuration: receipt.resultDuration,
        onProgress: timeTracking?.renderProgress ?? args.onProgress,
        signal: args.signal,
      });
    }
    videoOut.close();
    audioOut?.source.close();
    args.signal.throwIfAborted();
    args.onTimeEstimate?.(null);
    await output?.finalize();
    args.signal.throwIfAborted();
    receipt.resultDuration = Math.max(receipt.resultDuration, clock.time);
    args.onProgress?.(1);
    return receipt;
  } catch (error) {
    await output?.cancel().catch(() => undefined);
    throw error;
  } finally {
    args.onTimeEstimate?.(null);
    webcam?.dispose();
    transitionFrames?.dispose();
    source?.image?.close();
    source?.headerImage?.close();
    args.signal.removeEventListener('abort', dispose);
    input.dispose();
  }
}

interface ReviewRenderPreparation {
  codec: ReviewOutputCodec;
  container: 'mp4' | 'webm';
  resolution: VideoResolutionPreset;
  quality: ReviewRenderSettings['quality'];
  fps: number;
  windows: ReviewFrameWindow[];
  effective: ReturnType<typeof resolveQuickEditEffectiveState>;
}

/** Frame rendering validates ranges, while packet copying alone requires keyframes. */
function prepareReviewRender(args: {
  frameProbe?: { add(sample: VideoSample): Promise<void> };
  renderSettings?: ReviewRenderSettings | undefined;
  index: ReviewMediaIndex;
  edits: readonly ReviewEdit[];
  advanced: QuickEditAdvancedState;
}): ReviewRenderPreparation {
  let validRanges = true;
  try {
    buildReviewTimeMap(args.index.duration, args.edits);
  } catch {
    validRanges = false;
  }
  if (!validRanges) throw new Error('Export requires valid non-overlapping edit ranges.');
  const container = args.renderSettings?.format ?? args.index.container;
  const supported = reviewOutputCodecs(args.index, container);
  const codec = args.renderSettings?.codec ?? supported[0];
  if (!codec || !supported.includes(codec)) throw new QuickEditExportUnavailable(['video-encoder']);
  const requestedFps = args.renderSettings?.frameRate;
  if (
    (requestedFps !== undefined && ![0, 24, 30, 60].includes(requestedFps)) ||
    (args.renderSettings?.frameRateMode !== undefined &&
      args.renderSettings.frameRateMode !== 'constant' &&
      args.renderSettings.frameRateMode !== 'adaptive') ||
    (args.renderSettings?.frameRateMode === 'adaptive' && requestedFps !== 60)
  )
    throw new Error('Unsupported render frame rate.');
  const fps =
    requestedFps ||
    (args.index.frameRate && Number.isFinite(args.index.frameRate) && args.index.frameRate > 0
      ? args.index.frameRate
      : 30);
  const duration = buildReviewTimeMap(args.index.duration, args.edits).at(-1)?.resultEnd ?? 0;
  const windows = reviewRenderFrameSchedule(
    args.index.duration,
    args.edits,
    fps,
    args.frameProbe ? videoExportSampleWindows(duration, fps) : undefined
  );
  if (!windows.length) throw new Error('The edited video is empty.');
  return {
    codec,
    container,
    resolution: args.renderSettings?.resolution ?? VideoResolutionPreset.SOURCE,
    quality: args.renderSettings?.quality ?? 'HIGH',
    fps,
    windows,
    effective: resolveQuickEditEffectiveState(args.advanced),
  };
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
  headerImage: ImageBitmap | null;
  canvas: HTMLCanvasElement;
  sourceSize: { width: number; height: number };
  context: CanvasRenderingContext2D;
  image: ImageBitmap | null;
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
  const canvas = document.createElement('canvas');
  const scene = resolveReviewSceneOutput(sourceSize, preparation.effective, preparation.resolution);
  if (!scene.supported) throw new QuickEditExportUnavailable(['canvas-size']);
  const dimensions = scene.output;
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const scale = scene.scale;
  preparation.effective.background = scene.background;

  const supported = await supportedReviewVideoCodecs(preparation.container, {
    width: canvas.width,
    height: canvas.height,
    fps: preparation.fps,
    bitrate: resolveReviewRenderBitrate(
      { width: canvas.width, height: canvas.height, fps: preparation.fps },
      preparation.quality
    ),
  });
  if (!supported.includes(preparation.codec))
    throw new QuickEditExportUnavailable(['video-encoder']);
  signal.throwIfAborted();
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
      video,
      audio: audio ?? null,
      audioSink: audio ? new EncodedPacketSink(audio) : null,
      audioConfig,
      processedAudio,
      sampleRate: audio ? await audio.getSampleRate() : 0,
      canvas,
      sourceSize,
      sceneScale: scale,
      baseCanvas: scene.canvas,
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
    for await (const sample of renderReviewAudio(
      args.track,
      segment,
      args.muted,
      signal,
      args.exportAudio,
      args.clipRenderer
    )) {
      signal.throwIfAborted();
      await audioOut.source.add(sample);
      clock.time = Math.max(clock.time, sample.timestamp + sample.duration);
    }
    receipt.audioRanges.push({
      sourceStart: segment.sourceStart,
      sourceEnd: segment.sourceEnd,
      resultStart: segment.resultStart,
      resultEnd: segment.resultEnd,
    });
    return;
  }
  if (args.sink && args.audioCodec && audioOut?.kind === 'copy') {
    for await (const packet of retainedAudio(
      args.sink,
      segment,
      clock,
      args.audioCodec,
      args.sampleRate,
      receipt,
      signal
    )) {
      signal.throwIfAborted();
      await audioOut.source.add(packet, {
        ...(args.audioConfig ? { decoderConfig: args.audioConfig } : {}),
      });
      receipt.audioPackets++;
    }
  }
}

/** One window's frames: draws the scene and encodes at the fps lattice; returns the count. */
export async function renderRenderWindowFrames(args: {
  clickCues?: readonly ReviewClickCue[] | undefined;
  window: ReviewFrameWindow;
  adaptive?: boolean;
  adaptiveBudget?: ReturnType<typeof createAdaptiveComparisonBudget>;
  fps: number;
  fragmentOffset: number;
  zoomRegions: readonly QuickEditZoomRegion[];
  background: QuickEditAdvancedState['background'];
  comments: readonly CanvasCommentExport[];
  canvas: HTMLCanvasElement;
  sourceSize: { width: number; height: number };
  sceneScale?: number;
  baseCanvas?: { width: number; height: number };
  windowHeader?: QuickEditAdvancedState['windowHeader'];
  headerImage?: CanvasImageSource | null;
  context: CanvasRenderingContext2D;
  image: ImageBitmap | null;
  frameSink: Pick<VideoSampleSink, 'samplesAtTimestamps'>;
  sourceTimeResolution?: number;
  transitions?: readonly ReviewCutTransitionPlan[];
  transitionFrames?: ReturnType<typeof createReviewTransitionFrames> | null;
  webcam?: Awaited<ReturnType<typeof createReviewWebcamRenderer>> | null;
  videoOut: { add(sample: VideoSample): Promise<void>; close(): void };
  resultDuration: number;
  onProgress: ((fraction: number) => void) | undefined;
  signal: AbortSignal;
}): Promise<number> {
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
      (r.perspective?.enabled || r.depthOfField?.enabled)
  )
    ? createReviewSpatialRenderer()
    : undefined;
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
        const camera = evaluateQuickEditCameraAtTime(
          args.zoomRegions,
          timestamp + args.fragmentOffset
        );
        const layout = computeQuickEditSceneLayout({
          output: canvas,
          source: args.sourceSize,
          canvas: args.baseCanvas ?? canvas,
          windowHeader: args.windowHeader,
          background: args.background,
          camera,
        });
        const burned = args.comments.filter(
          (comment) =>
            comment.renderToVideo &&
            isCanvasCommentVisibleAt(
              comment,
              window.sourceTimes[frame] ?? window.segment.sourceStart
            )
        );
        const blend = reviewCutTransitionAt(timestamp, args.transitions ?? []);
        if (blend) {
          const frames = await args.transitionFrames?.load(blend.plan);
          signal.throwIfAborted();
          if (!frames) throw new QuickEditExportUnavailable(['transition-frames']);
          paintReviewCutTransition(rasterContext, raster, blend, frames, sample);
        } else sample.draw(rasterContext, 0, 0, raster.width, raster.height);
        drawReviewSceneFrame(context, {
          spatialRenderer,
          canvas,
          layout,
          background: args.background,
          image: args.image,
          headerImage: args.headerImage,
          sample: {
            draw: (target, x, y, width, height) => target.drawImage(raster, x, y, width, height),
          },
          deferComments: true,
          comments: burned,
          sourceTime: window.sourceTimes[frame] ?? window.segment.sourceStart,
          cameraScale: camera.scale,
          motionBlur: blurEnabled
            ? quickEditMotionBlurCameras(args.zoomRegions, timestamp + args.fragmentOffset)
            : undefined,
          sceneScale: args.sceneScale ?? 1,
        });
        drawReviewSceneOverlays({
          scene: {
            canvas,
            layout,
            background: args.background,
            image: args.image,
            sample,
            comments: burned,
            sourceTime: window.sourceTimes[frame] ?? window.segment.sourceStart,
            sceneScale: args.sceneScale ?? 1,
          },
          renderer: spatialRenderer,
          context,
          canvas,
          spotlightScratch: scratch,
          regions: args.zoomRegions,
          globalResultTime: timestamp + args.fragmentOffset,
          cameraScale: camera.scale,
          sourceWidth: args.sourceSize.width,
          clicks: args.clickCues,
        });
        if (webcamFrames) {
          const cameraFrame = await webcamFrames.next();
          signal.throwIfAborted();
          if (cameraFrame.done) throw new QuickEditExportUnavailable(['asset-missing']);
          cameraFrame.value?.draw(context, canvas);
        }
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
      await args.videoOut.add(sample);
      emitted++;
    } finally {
      sample.close();
    }
  };
  const adaptive = args.adaptive
    ? createAdaptiveFrameWriter(
        args.context,
        (frame, timestampUs, durationUs) =>
          emit(frame.clone(), timestampUs / 1e6, durationUs / 1e6),
        args.signal,
        args.adaptiveBudget
      )
    : null;
  return {
    async add(timestamp: number, end: number, constantDuration: number) {
      if (!adaptive) {
        await emit(args.canvas, timestamp, constantDuration);
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
