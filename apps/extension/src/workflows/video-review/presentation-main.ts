import { createPresentationDecoder } from './presentation-decoder';
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink, type InputAudioTrack } from 'mediabunny';
import type { PresentationCandidate } from '../../features/video/review/presentation-sequence';
import type { ReviewEdit } from '../../features/video/review/types';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import type { CanvasCommentExport } from '../../features/video/review/comments';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import type { ReviewKeyCue } from '../../features/video/review/key-animation';
import { planReviewCutTransitions, reviewCutTransitionAt } from '../../features/video/review/cuts';
import { createReviewDecodedSampleSink } from './decoded-video-sample';
import { createReviewTransitionFrames } from './cut-transition-frames';
import { createReviewWebcamRenderer } from './render-webcam';
import { createReviewPreviewRenderer } from './render-preview';
import { createPreviewRenderResources } from './preview-render-resources';
import {
  calculatePreviewRenderAllocation,
  resolvePreviewRenderAllocation,
} from './preview-render-allocation';
import type { PreviewRenderAllocationInput } from './preview-render-allocation';
import type { ReviewMediaIndex } from './media-index';
import { QuickEditExportUnavailable } from './export-unavailable';
import type { ReviewTimeSegment } from '../../features/video/review/time-segment';
import type { ReviewAnnotationEffectSnapshot } from '../../features/video/review/annotation-effects/types';

type Renderer = ReturnType<typeof createReviewPreviewRenderer>;
type Scene = Parameters<Renderer['prepare']>[0];
type Frame = Parameters<Renderer['render']>[1];
type SampleSink = ReturnType<typeof createReviewDecodedSampleSink>;
type Camera = Awaited<ReturnType<typeof createReviewWebcamRenderer>>;

export interface ReviewPresentationMainInput {
  file: Blob;
  index: ReviewMediaIndex;
  edits: readonly ReviewEdit[];
  captionTimeMap?: readonly ReviewTimeSegment[];
  effectSnapshots?: readonly ReviewAnnotationEffectSnapshot[];
  fps?: number;
  /** Repeatable export/preview lattice; sparse probes supply only their selected candidates. */
  plannedCandidates?: () => Iterable<PresentationCandidate>;
  effective: ReturnType<typeof resolveQuickEditEffectiveState>;
  comments?: readonly CanvasCommentExport[];
  clickCues?: readonly ReviewClickCue[];
  keyCues?: readonly ReviewKeyCue[];
  fragmentOffset: number;
  dimensions: Parameters<Renderer['prepare']>[1];
  readAsset(assetId: string): Promise<Blob | null>;
  signal: AbortSignal;
}

/** One offline decoder lifetime; pixels use the same prepared scene as manual preview. */
export async function createReviewPresentationMain(args: ReviewPresentationMainInput) {
  args.signal.throwIfAborted();
  const owner = new PresentationMain(args);
  try {
    await owner.open();
    return {
      render: owner.render.bind(owner),
      renderAtTime: owner.renderAtTime.bind(owner),
      /** Borrowed from the same Input; expires on disposal or cancellation. */
      audioTrack: owner.audioTrack,
      dispose: owner.dispose,
    };
  } catch (error) {
    owner.dispose();
    throw error;
  }
}

class PresentationMain {
  audioTrack: InputAudioTrack | null = null;
  private readonly input: Input;
  private readonly controller = new AbortController();
  private readonly resources = createPreviewRenderResources({
    maximumManagedBytes: 1,
    maximumCanvases: 1,
  });
  private readonly segments;
  private readonly transitions;
  private readonly renderer: Renderer;
  private scene: Scene | null = null;
  private sink: SampleSink | null = null;
  private transitionSink: SampleSink | null = null;
  private decoder: ReturnType<typeof createPresentationDecoder> | null = null;
  private camera: Camera | null = null;
  private resolution = 0;
  private disposed = false;
  private busy = false;
  private frameGeneration = 0;
  private front: Awaited<ReturnType<Renderer['render']>> | null = null;
  private sourceTime = 0;
  private resultTime = 0;
  private sourceBytes: number | null = null;
  private cameraBytes: number | null = null;
  private transitionBytes: readonly [number, number] | null = null;
  private assets: PreviewRenderAllocationInput['assets'] = {
    headerBitmap: null,
    backgroundBitmap: null,
    watermark: null,
    previousWatermarkCache: null,
  };

  constructor(private readonly args: ReviewPresentationMainInput) {
    this.segments = buildReviewTimeMap(args.index.duration, args.edits).filter(
      (part) => part.kind !== 'cut'
    );
    if (!this.segments.length || !Number.isFinite(args.fragmentOffset) || args.fragmentOffset < 0)
      throw new Error('Invalid main presentation range');
    this.transitions = planReviewCutTransitions(args.index.duration, args.edits);
    this.input = new Input({ source: new BlobSource(args.file), formats: ALL_FORMATS });
    this.renderer = createReviewPreviewRenderer({
      resources: this.resources,
      readAsset: args.readAsset,
      allocation: {
        describe: this.graph,
        replaceLimits: (limits) => this.resources.replaceLimits(limits),
      },
    });
    args.signal.addEventListener('abort', this.dispose, { once: true });
  }

  private graph = () => {
    if (!this.scene) throw new Error('Main presentation is not ready');
    return resolvePreviewRenderAllocation({
      scene: this.scene,
      dimensions: this.args.dimensions,
      resultTime: this.resultTime,
      sourceTime: this.sourceTime,
      sourceAllocationBytes: this.sourceBytes,
      sourceBacking: this.scene.source,
      camera: { retainedBytes: null, activeBytes: this.cameraBytes },
      transitionBytes: this.transitionBytes,
      previousFront: null,
      assets: this.assets,
    });
  };

  async open() {
    const signal = this.controller.signal;
    const video = await this.input.getPrimaryVideoTrack();
    signal.throwIfAborted();
    if (!video || video.codec !== this.args.index.videoCodec || !(await video.canDecode()))
      throw new QuickEditExportUnavailable(['video-encoder']);
    const source = { width: await video.getDisplayWidth(), height: await video.getDisplayHeight() };
    this.resolution = await video.getTimeResolution();
    if (
      ![source.width, source.height, this.resolution].every(
        (value) => Number.isFinite(value) && value > 0
      )
    )
      throw new Error('Invalid main source dimensions or time resolution');
    signal.throwIfAborted();
    const audio = await this.input.getPrimaryAudioTrack();
    signal.throwIfAborted();
    this.audioTrack = audio;
    const effective = this.args.effective;
    const documentSegments =
      this.args.captionTimeMap ?? buildReviewTimeMap(this.args.index.duration, this.args.edits);
    if (
      this.args.fragmentOffset > 0 &&
      (effective.captions || effective.annotationEffects) &&
      !this.args.captionTimeMap
    )
      throw new Error('Fragment overlays require the full document time map.');
    this.scene = {
      source,
      ...(effective.canvas ? { canvas: effective.canvas } : {}),
      background: effective.background,
      windowHeader: effective.windowHeader,
      watermark: effective.watermark,
      webcam: effective.webcam,
      zoomRegions: effective.zoomRegions,
      comments: (this.args.comments ?? []).filter((comment) => comment.renderToVideo),
      keys: this.args.keyCues ?? [],
      clicks: this.args.clickCues ?? [],
      ...(effective.annotationEffects
        ? {
            annotationEffects: {
              lane: effective.annotationEffects,
              snapshots: this.args.effectSnapshots ?? [],
              segments: documentSegments,
            },
          }
        : {}),
      ...(effective.captions
        ? {
            captions: {
              document: effective.text,
              settings: effective.captions,
              segments: documentSegments,
            },
          }
        : {}),
    };
    this.sink = createReviewDecodedSampleSink(
      new VideoSampleSink(video),
      signal,
      await video.getDecoderConfig()
    );
    this.transitionSink = createReviewDecodedSampleSink(
      new VideoSampleSink(video),
      signal,
      await video.getDecoderConfig()
    );
    if (this.args.plannedCandidates) {
      this.decoder = createPresentationDecoder(this.sink, () => this.plannedSourceTimes(), signal);
    }
    if (effective.webcam) {
      const camera = await createReviewWebcamRenderer(
        effective.webcam,
        this.args.readAsset,
        signal
      );
      if (signal.aborted) {
        camera.dispose();
        signal.throwIfAborted();
      }
      this.camera = camera;
    }
    signal.throwIfAborted();
    if (effective.captions) {
      this.scene = { ...this.scene, webcamDuration: this.camera?.duration };
      if (this.args.fragmentOffset > 0 && !this.args.captionTimeMap)
        throw new Error('Fragment captions require the full document time map.');
      const prepared = await this.renderer.prepare(this.scene, this.args.dimensions, signal);
      try {
        this.assets = prepared.allocationAssets;
        const end = this.args.fragmentOffset + this.segments.at(-1)!.resultEnd;
        const conflicts = prepared.captionConflicts.filter(
          (entry) => entry.start < end && this.args.fragmentOffset < entry.end
        );
        if (conflicts.length) throw new QuickEditExportUnavailable(['caption-layout'], conflicts);
      } finally {
        prepared.release();
      }
    }
  }

  private *plannedSourceTimes() {
    for (const candidate of this.args.plannedCandidates?.() ?? []) {
      if (
        candidate.segment !== 'main' ||
        candidate.mapping.kind !== 'main' ||
        candidate.mapping.holdLast
      )
        continue;
      yield { tick: candidate.tick, time: this.map(candidate, undefined).sourceTime };
    }
  }

  private map(candidate: PresentationCandidate, heldMainLocalTime: number | undefined) {
    const mapping = candidate.mapping;
    if (candidate.segment !== 'main' || mapping.kind !== 'main')
      throw new Error('Expected a main presentation candidate');
    const localTime = mapping.holdLast ? heldMainLocalTime : mapping.mainLocalTime;
    if (localTime === undefined || !Number.isFinite(localTime) || localTime < 0)
      throw new Error('A held main frame requires its last valid output clock');
    if (
      !Number.isFinite(mapping.globalMainTime) ||
      mapping.globalMainTime !== this.args.fragmentOffset + mapping.mainLocalTime
    )
      throw new Error('Invalid main presentation clock');
    return this.mapTime(localTime);
  }

  private mapTime(localTime: number) {
    const segment = this.segments.find(
      (part) => localTime >= part.resultStart && localTime < part.resultEnd
    );
    if (!Number.isFinite(localTime) || !segment) throw new Error('Invalid main source clock');
    const firstTick = Math.ceil(segment.sourceStart * this.resolution) / this.resolution;
    const lastTick = (Math.ceil(segment.sourceEnd * this.resolution) - 1) / this.resolution;
    const requested = segment.sourceStart + (localTime - segment.resultStart) * segment.rate;
    const sourceTime = Math.min(
      lastTick,
      Math.max(firstTick, Math.round(requested * this.resolution) / this.resolution)
    );
    if (firstTick > lastTick) throw new Error('Main source interval has no representable tick');
    return {
      sourceTime,
      resultTime: this.args.fragmentOffset + localTime,
      localTime,
    };
  }

  /**
   * Caller releases the output before another candidate; decoder samples close after paint.
   * A held candidate requires the last non-held main clock from the frozen output lattice.
   */
  async render(candidate: PresentationCandidate, options: { heldMainLocalTime?: number } = {}) {
    return this.renderFrame(
      this.map(candidate, options.heldMainLocalTime),
      candidate.tick,
      candidate.tick
    );
  }

  /** Ordinary export preserves the original segment-relative frame schedule. */
  async renderAtTime(localTime: number) {
    return this.renderFrame(this.mapTime(localTime), ++this.frameGeneration);
  }

  private async renderFrame(
    mapped: ReturnType<PresentationMain['mapTime']>,
    generation: number,
    plannedTick?: number
  ) {
    if (this.disposed || this.busy || this.front)
      throw new Error('Main presentation frame is unavailable');
    this.busy = true;
    this.sourceTime = mapped.sourceTime;
    this.resultTime = mapped.resultTime;
    const signal = this.controller.signal;
    const leases: { release(): void }[] = [];
    const transition = createReviewTransitionFrames(this.transitionSink!, signal);
    const cameraFrames = this.camera?.sourceFrames([this.sourceTime]);
    let source: Awaited<ReturnType<SampleSink['getSample']>> = null;
    let prepared: Awaited<ReturnType<Renderer['prepare']>> | undefined;
    try {
      signal.throwIfAborted();
      prepared = await this.renderer.prepare(this.scene!, this.args.dimensions, signal);
      signal.throwIfAborted();
      this.assets = prepared.allocationAssets;
      source = await (this.decoder
        ? this.decoder.read(plannedTick, this.sourceTime)
        : this.sink!.getSample(this.sourceTime));
      signal.throwIfAborted();
      if (!source) throw new Error('Main source frame is unavailable');
      const blend = reviewCutTransitionAt(mapped.localTime, this.transitions);
      const endpoints = blend ? await transition.load(blend.plan) : null;
      signal.throwIfAborted();
      if (blend && !endpoints) throw new QuickEditExportUnavailable(['transition-frames']);
      const cameraResult = await cameraFrames?.next();
      const camera = cameraResult && !cameraResult.done ? cameraResult.value : null;
      signal.throwIfAborted();
      this.sourceBytes = source.allocationSize();
      this.cameraBytes = camera?.allocationBytes() ?? null;
      this.transitionBytes = endpoints
        ? [endpoints.left.allocationSize!(), endpoints.right.allocationSize!()]
        : null;
      this.resources.replaceLimits(calculatePreviewRenderAllocation(this.graph()));
      leases.push(this.resources.bytes('main-source', this.sourceBytes));
      if (this.cameraBytes !== null)
        leases.push(this.resources.bytes('main-camera', this.cameraBytes));
      if (this.transitionBytes)
        leases.push(
          this.resources.bytes('main-transition', this.transitionBytes[0] + this.transitionBytes[1])
        );
      const frame: Frame = {
        generation,
        fps: this.args.fps ?? this.args.index.frameRate ?? 30,
        sourceTime: this.sourceTime,
        resultTime: this.resultTime,
        source: {
          timestamp: source.timestamp,
          backing: this.scene!.source,
          draw: source.draw.bind(source),
        },
        ...(camera
          ? {
              camera: {
                representedMediaTime: camera.representedMediaTime,
                generation,
                source: camera.source,
                placement: camera.placement,
                ...(camera.crop ? { crop: camera.crop } : {}),
                drawable: camera.drawable,
              },
            }
          : {}),
        ...(blend && endpoints
          ? { transition: { blend, frames: endpoints, resultOffset: this.args.fragmentOffset } }
          : {}),
      };
      const output = await this.renderer.render(prepared, frame, signal);
      this.front = output;
      let released = false;
      return {
        canvas: output.canvas,
        context: output.context,
        release: () => {
          if (released) return;
          released = true;
          output.release();
          if (this.front === output) this.front = null;
        },
      };
    } finally {
      source?.close();
      transition.dispose();
      try {
        await cameraFrames?.return(undefined);
      } finally {
        for (const lease of leases) lease.release();
        prepared?.release();
        this.sourceBytes = this.cameraBytes = this.transitionBytes = null;
        this.busy = false;
        signal.throwIfAborted();
      }
    }
  }

  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.args.signal.removeEventListener('abort', this.dispose);
    this.controller.abort();
    this.camera?.dispose();
    this.front?.release();
    this.front = null;
    this.renderer.dispose();
    this.resources.dispose();
    this.input.dispose();
    // Input disposal above terminates native decoding; pending iterator cleanup can reject on abort.
    void this.decoder?.dispose().catch(() => undefined);
    this.decoder = null;
  };
}
