import { evaluateQuickEditSpotlightAtTime } from '../../features/video/review/advanced/focus';
import { drawReviewSpotlight } from './render-spotlight';
import type { ReviewRenderSettings } from './media-index';
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
import { resolveReviewRenderBitrate } from './render-settings';
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
  quickEditContentPointToCanvas,
} from '../../features/video/review/advanced/scene';
import {
  canvasCommentBubble,
  isCanvasCommentVisibleAt,
  overlayPulsePhase,
  type CanvasCommentExport,
} from '../../features/video/review/comments';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { drawSceneGradient } from '../../features/video/project/scene/background-gradient-canvas';
import type { ReviewMediaIndex } from './media-index';
import { createReviewMediaOutput } from './media-output';
import { chooseReviewAudioCodec, renderReviewAudio } from './audio-render';
import { retainedAudio, type ReviewPacketReceipt } from './packet-export';
import { QuickEditExportUnavailable } from './export-unavailable';
import type { ReviewExportClipPlan } from './audio-render';

type Segment = ReturnType<typeof buildReviewTimeMap>[number];
type ReviewAudioOut = ReturnType<typeof createReviewMediaOutput>['audio'];

interface ReviewFrameWindow {
  segment: Segment;
  /** Output timestamps of the window's frames, on the fps lattice. */
  timestamps: number[];
  /** Source positions sampled for each output timestamp. */
  sourceTimes: number[];
}

/** Output frame schedule over kept segments; the last frame never passes the segment end. */
export function reviewRenderFrameSchedule(
  duration: number,
  edits: readonly ReviewEdit[],
  fps: number
): ReviewFrameWindow[] {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Render frame rate is invalid.');
  return buildReviewTimeMap(duration, edits)
    .filter((part) => part.kind !== 'cut')
    .map((segment) => {
      const count = Math.max(1, Math.ceil((segment.resultEnd - segment.resultStart) * fps - 1e-9));
      return {
        segment,
        timestamps: Array.from({ length: count }, (_, k) => segment.resultStart + k / fps),
        sourceTimes: Array.from(
          { length: count },
          (_, k) => segment.sourceStart + (k / fps) * segment.rate
        ),
      };
    });
}

/**
 * Full frame render for pixel-changing effects: decodes source frames, draws the
 * shared scene layout (background, camera zoom), and encodes the output at the
 * probed frame rate. Audio follows the same plan as the packet path; fragment
 * ranges keep camera and audio on global output time while timestamps start at zero.
 */
export async function writeReviewFrames(args: {
  renderSettings?: ReviewRenderSettings | undefined;
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
}): Promise<ReviewPacketReceipt> {
  const preparation = prepareReviewRender(args);
  const input = new Input({ source: new BlobSource(args.file), formats: ALL_FORMATS });
  const dispose = () => input.dispose();
  args.signal.addEventListener('abort', dispose, { once: true });
  let output: Output | null = null;
  try {
    const source = await openReviewRenderSource(args, input, preparation);
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
    const tracks = createReviewMediaOutput({
      index: args.index,
      processedAudio: source.processedAudio,
      writer: args.writer,
      signal: args.signal,
      ...(args.provenance ? { provenance: args.provenance } : {}),
      sampleVideo: {
        codec: preparation.codec,
        frameRate: preparation.fps,
        bitrate: resolveReviewRenderBitrate(
          args.index,
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
    output = tracks.output;
    if (tracks.video.kind !== 'sample') throw new Error('Video output configuration changed.');
    const videoOut = tracks.video.source;
    const audioOut = tracks.audio;
    await tracks.output.start();
    const frameSink = new VideoSampleSink(source.video);
    for (const window of preparation.windows) {
      const segment = window.segment;
      args.signal.throwIfAborted();
      await drainSegmentAudio({
        segment,
        track: source.audio,
        sink: source.audioSink,
        audioOut,
        processedAudio: source.processedAudio,
        audioConfig: source.audioConfig,
        muted: segmentAudioMuted(args.edits, segment, args.exportAudio),
        exportAudio: args.exportAudio,
        sampleRate: source.sampleRate,
        audioCodec: args.index.audioCodec,
        clock,
        receipt,
        signal: args.signal,
      });
      receipt.videoPackets += await renderRenderWindowFrames({
        window,
        fps: preparation.fps,
        fragmentOffset: args.fragmentOffset,
        zoomRegions: preparation.effective.zoomRegions,
        background: preparation.effective.background,
        comments: args.comments ?? [],
        canvas: source.canvas,
        sourceSize: source.sourceSize,
        context: source.context,
        image: source.image,
        frameSink,
        videoOut,
        resultDuration: receipt.resultDuration,
        onProgress: args.onProgress ?? undefined,
        signal: args.signal,
      });
    }
    videoOut.close();
    audioOut?.source.close();
    args.signal.throwIfAborted();
    await output.finalize();
    args.signal.throwIfAborted();
    receipt.resultDuration = Math.max(receipt.resultDuration, clock.time);
    args.onProgress?.(1);
    return receipt;
  } catch (error) {
    await output?.cancel().catch(() => undefined);
    throw error;
  } finally {
    args.signal.removeEventListener('abort', dispose);
    input.dispose();
  }
}

interface ReviewRenderPreparation {
  codec: 'avc' | 'vp8' | 'vp9';
  fps: number;
  windows: ReviewFrameWindow[];
  effective: ReturnType<typeof resolveQuickEditEffectiveState>;
}

/** Frame rendering validates ranges, while packet copying alone requires keyframes. */
function prepareReviewRender(args: {
  renderSettings?: ReviewRenderSettings | undefined;
  index: ReviewMediaIndex;
  edits: readonly ReviewEdit[];
  advanced: QuickEditAdvancedState;
}): ReviewRenderPreparation {
  const ordered = [...args.edits].sort((left, right) => left.start - right.start);
  if (
    ordered.some(
      (edit, index) =>
        !Number.isFinite(edit.start) ||
        !Number.isFinite(edit.end) ||
        edit.start < 0 ||
        edit.end > args.index.duration ||
        edit.start >= edit.end ||
        (index > 0 && edit.start < ordered[index - 1]!.end)
    )
  )
    throw new Error('Export requires valid non-overlapping edit ranges.');
  const codec = args.renderSettings?.codec ?? args.index.processedVideoCodec;
  const supported =
    args.index.supportedVideoCodecs ??
    (args.index.processedVideoCodec ? [args.index.processedVideoCodec] : []);
  if (
    !codec ||
    !supported.includes(codec) ||
    (args.index.container === 'mp4' ? codec !== 'avc' : codec === 'avc')
  )
    throw new QuickEditExportUnavailable(['video-encoder']);
  const requestedFps = args.renderSettings?.frameRate;
  if (requestedFps !== undefined && ![0, 24, 30, 60].includes(requestedFps))
    throw new Error('Unsupported render frame rate.');
  const fps =
    requestedFps ||
    (args.index.frameRate && Number.isFinite(args.index.frameRate) && args.index.frameRate > 0
      ? args.index.frameRate
      : 30);
  const windows = reviewRenderFrameSchedule(args.index.duration, args.edits, fps);
  if (!windows.length) throw new Error('The edited video is empty.');
  return {
    codec,
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
      (edit) => edit.kind === 'speed' && edit.start === segment.sourceStart && edit.audio === 'mute'
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
  const processing = (speedExists && !!audio) || !!args.exportAudio;
  const processedAudio = processing
    ? await chooseReviewAudioCodec(audio ?? null, index.container)
    : null;
  if (processing && !processedAudio) throw new Error('Audio processing is unavailable.');
  const sourceSize = {
    width: Math.round(await video.getDisplayWidth()),
    height: Math.round(await video.getDisplayHeight()),
  };
  const canvas = document.createElement('canvas');
  canvas.width = preparation.effective.canvas?.width ?? sourceSize.width;
  canvas.height = preparation.effective.canvas?.height ?? sourceSize.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context is unavailable.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const backgroundImage =
    preparation.effective.background.enabled && preparation.effective.background.type === 'image'
      ? await loadBackgroundImage(
          preparation.effective.background.assetId,
          args.readProjectAsset,
          signal
        )
      : null;
  return {
    video,
    audio: audio ?? null,
    audioSink: audio ? new EncodedPacketSink(audio) : null,
    audioConfig,
    processedAudio,
    sampleRate: audio ? await audio.getSampleRate() : 0,
    canvas,
    sourceSize,
    context,
    image: backgroundImage,
  };
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
      args.exportAudio
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
  window: ReviewFrameWindow;
  fps: number;
  fragmentOffset: number;
  zoomRegions: readonly QuickEditZoomRegion[];
  background: QuickEditAdvancedState['background'];
  comments: readonly CanvasCommentExport[];
  canvas: HTMLCanvasElement;
  sourceSize: { width: number; height: number };
  context: CanvasRenderingContext2D;
  image: ImageBitmap | null;
  frameSink: VideoSampleSink;
  videoOut: { add(sample: VideoSample): Promise<void>; close(): void };
  resultDuration: number;
  onProgress: ((fraction: number) => void) | undefined;
  signal: AbortSignal;
}): Promise<number> {
  const { window, fps, canvas, context, videoOut, signal } = args;
  const scratch = args.zoomRegions.some((region) => region.spotlight?.effect === 'blur')
    ? document.createElement('canvas')
    : null;
  if (scratch) {
    scratch.width = canvas.width;
    scratch.height = canvas.height;
  }
  let frame = 0;
  for await (const sample of args.frameSink.samplesAtTimestamps(window.sourceTimes)) {
    signal.throwIfAborted();
    if (!sample) throw new Error('Source frame is unavailable.');
    const timestamp = window.timestamps[frame]!;
    try {
      const camera = evaluateQuickEditCameraAtTime(
        args.zoomRegions,
        timestamp + args.fragmentOffset
      );
      const layout = computeQuickEditSceneLayout({
        output: canvas,
        source: args.sourceSize,
        canvas,
        background: args.background,
        camera,
      });
      const burned = args.comments.filter(
        (comment) =>
          comment.renderToVideo &&
          isCanvasCommentVisibleAt(comment, window.sourceTimes[frame] ?? window.segment.sourceStart)
      );
      drawReviewSceneFrame(context, {
        canvas,
        layout,
        background: args.background,
        image: args.image,
        sample,
        comments: burned,
        sourceTime: window.sourceTimes[frame] ?? window.segment.sourceStart,
        cameraScale: camera.scale,
      });
      drawReviewSpotlight(
        context,
        canvas,
        scratch,
        evaluateQuickEditSpotlightAtTime({
          regions: args.zoomRegions,
          time: timestamp + args.fragmentOffset,
          output: canvas,
          video: layout.videoRect,
          scale: 1,
        })
      );
      const encoded = new VideoSample(canvas, { timestamp, duration: 1 / fps });
      try {
        await videoOut.add(encoded);
      } finally {
        encoded.close();
      }
    } finally {
      sample.close();
    }
    args.onProgress?.(Math.min(1, (timestamp + 1 / fps) / args.resultDuration));
    frame++;
  }
  return frame;
}

async function loadBackgroundImage(
  assetId: string,
  readProjectAsset: (assetId: string) => Promise<Blob | null>,
  signal: AbortSignal
): Promise<ImageBitmap | null> {
  if (!assetId) throw new QuickEditExportUnavailable(['asset-missing']);
  const blob = await readProjectAsset(assetId);
  signal.throwIfAborted();
  if (!blob) throw new QuickEditExportUnavailable(['asset-missing']);
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new QuickEditExportUnavailable(['asset-missing']);
  }
}

/**
 * One scene draw for export: full-canvas paint, rounded content clip, and the
 * camera-transformed frame. Content-attached overlays burn inside the content
 * clip; viewport-attached ones burn onto the composition frame after the clip.
 * Mirrors the preview stage so decoded frames and preview stay comparable.
 */
export function drawReviewSceneFrame(
  context: CanvasRenderingContext2D,
  args: {
    canvas: { width: number; height: number };
    layout: ReturnType<typeof computeQuickEditSceneLayout>;
    background: QuickEditAdvancedState['background'];
    image: ImageBitmap | null;
    sample: Pick<VideoSample, 'draw'>;
    comments?: readonly CanvasCommentExport[];
    sourceTime?: number;
    cameraScale?: number;
  }
) {
  const { canvas, layout, background, image, sample, comments, sourceTime } = args;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (background.enabled) {
    if (background.type === 'solid') {
      context.fillStyle = background.color;
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else if (background.type === 'gradient') {
      drawSceneGradient(context, background.gradient, canvas.width, canvas.height);
    } else if (image) {
      drawFittedImage(context, image, canvas.width, canvas.height, background.imageFit);
    }
  }
  const visible = (comments ?? []).filter(
    (comment) =>
      comment.renderToVideo &&
      (sourceTime === undefined || isCanvasCommentVisibleAt(comment, sourceTime))
  );
  context.save();
  context.beginPath();
  const clip = background.enabled ? background.layout : null;
  if (clip && clip.cornerRadius > 0) {
    context.roundRect(
      layout.videoRect.x,
      layout.videoRect.y,
      layout.videoRect.width,
      layout.videoRect.height,
      Math.min(clip.cornerRadius, Math.min(layout.videoRect.width, layout.videoRect.height) / 2)
    );
  } else {
    context.rect(
      layout.videoRect.x,
      layout.videoRect.y,
      layout.videoRect.width,
      layout.videoRect.height
    );
  }
  context.clip();
  sample.draw(
    context,
    layout.videoTransform.x,
    layout.videoTransform.y,
    layout.videoTransform.width,
    layout.videoTransform.height
  );
  const cameraScale = args.cameraScale ?? 1;
  for (const comment of visible) {
    if (comment.attachment === 'content')
      drawReviewComment(context, comment, {
        canvas,
        videoTransform: layout.videoTransform,
        scale: cameraScale,
        sourceTime,
      });
  }
  context.restore();
  for (const comment of visible) {
    if (comment.attachment !== 'content')
      drawReviewComment(context, comment, {
        canvas,
        videoTransform: null,
        scale: 1,
        sourceTime,
      });
  }
}

/** The design token value the preview paints with `--sniptale-color-accent`. */
const CANVAS_COMMENT_ACCENT = '#f97316';

/** One burned overlay: pulsing point plus the wrapped bubble, in output pixels. */
function drawReviewComment(
  context: CanvasRenderingContext2D,
  comment: CanvasCommentExport,
  args: {
    canvas: { width: number; height: number };
    videoTransform: { x: number; y: number; width: number; height: number } | null;
    scale: number;
    sourceTime: number | undefined;
  }
) {
  const point = args.videoTransform
    ? quickEditContentPointToCanvas(comment.position, args.videoTransform)
    : { x: comment.position.x * args.canvas.width, y: comment.position.y * args.canvas.height };
  const bubble = canvasCommentBubble(comment.style, {
    width: args.canvas.width / args.scale,
    height: args.canvas.height / args.scale,
  });
  const pointRadius = bubble.pointRadius * args.scale;
  const phase = overlayPulsePhase(args.sourceTime ?? 0, comment.start);
  context.save();
  if (phase > 0 && phase < 1) {
    const ringRadius = pointRadius * (1 + 1.4 * phase);
    context.globalAlpha = 0.35 * (1 - phase);
    context.fillStyle = CANVAS_COMMENT_ACCENT;
    context.beginPath();
    context.arc(point.x, point.y, ringRadius, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }
  context.fillStyle = CANVAS_COMMENT_ACCENT;
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2 * args.scale;
  context.beginPath();
  context.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  const text = comment.resolvedText;
  if (text.trim()) {
    const fontSize = bubble.fontSize * args.scale;
    const lineHeight = bubble.lineHeight * args.scale;
    const maxWidth = bubble.maxWidth * args.scale;
    const paddingX = bubble.paddingX * args.scale;
    const paddingY = bubble.paddingY * args.scale;
    const radius = comment.style.radius * args.scale;
    context.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    const maxHeight = bubble.maxHeight * args.scale;
    const maxLines = Math.max(1, Math.floor((maxHeight - paddingY * 2) / lineHeight));
    const lines = wrapCanvasText(context, text, Math.max(1, maxWidth - paddingX * 2), maxLines);
    const textWidth = Math.max(...lines.map((line) => context.measureText(line).width));
    const boxWidth = Math.min(maxWidth, textWidth + paddingX * 2);
    const boxHeight = Math.min(maxHeight, lines.length * lineHeight + paddingY * 2);
    const below = comment.placement === 'below';
    const boxX = point.x - boxWidth / 2;
    const boxY = below
      ? point.y + pointRadius + bubble.gap * args.scale
      : point.y - pointRadius - bubble.gap * args.scale - boxHeight;
    context.save();
    context.beginPath();
    context.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
    context.clip();
    const paint = comment.style.fillPaint;
    if (paint.kind === 'solid') {
      context.fillStyle = paint.color;
      context.fillRect(boxX, boxY, boxWidth, boxHeight);
    } else {
      context.translate(boxX, boxY);
      drawSceneGradient(context, paint.gradient, boxWidth, boxHeight);
    }
    context.restore();
    context.save();
    context.beginPath();
    context.rect(boxX, boxY, boxWidth, boxHeight);
    context.clip();
    context.fillStyle = comment.style.textColor;
    context.textBaseline = 'top';
    lines.forEach((line, index) => {
      context.fillText(line, boxX + paddingX, boxY + paddingY + index * lineHeight);
    });
    context.restore();
  }
  context.restore();
}

/** Word-wraps explicit paragraphs into lines that fit the measured width. */
function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push(current);
        if (lines.length >= maxLines) return lines;
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
    if (lines.length >= maxLines) return lines;
  }
  return lines;
}

function drawFittedImage(
  context: CanvasRenderingContext2D,
  image: ImageBitmap,
  width: number,
  height: number,
  fit: 'cover' | 'contain'
) {
  const scale =
    fit === 'cover'
      ? Math.max(width / image.width, height / image.height)
      : Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}
