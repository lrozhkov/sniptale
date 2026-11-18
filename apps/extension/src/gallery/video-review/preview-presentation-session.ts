import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { canCoalescePresentationInteraction } from './preview-presentation-state';
import type { VideoPreviewRenderer } from '../../features/video/preview/preferences';
import { prepareReviewCameraPlans } from '../../features/video/review/advanced/camera-plan-preparation';
import { createEffectRuntimeSandboxExecutor } from '../../workflows/video/effect-runtime-sandbox';
import { createReviewPreviewRenderer } from '../../workflows/video-review/render-preview';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import {
  quickEditWebcamFrameAt,
  quickEditWebcamScreenPlacementAt,
  type QuickEditWebcamPlacement,
} from '../../features/video/review/advanced/webcam';
import {
  createReviewPreviewPresentation,
  createReviewPresentationPaintClock,
} from './preview-presentation';
import type { useReviewCutTransitionProvider } from './cut-transition-preview';
import { createReviewWebcamPreviewSource } from './webcam-preview';
import {
  attachReviewPreviewCamera,
  captureReviewPreviewFrame,
  captureDecodedReviewPreviewFrame,
} from './preview-presentation-frame';
import {
  createPreviewSourceProvider,
  type PreviewSourceProvider,
  type PreviewSourceDemand,
} from '../../workflows/video/preview-source';
import {
  createPreviewHtmlSourceProvider,
  type PreparedPreviewSourceLease,
} from '../../workflows/video/preview-html-source';
import { buildReviewTimeMap, reviewSegmentSourceTime } from '../../features/video/review/timeline';
import {
  buildReviewPreviewBoundaries,
  nearestReviewCut,
  nextReviewCutDeadline,
} from './preview-boundaries';
import { createPresentationAdmission } from './preview-presentation-admission';
import {
  createReviewExportDiagnostics,
  reviewExportPhase,
} from '../../workflows/video-review/export-diagnostics';
import type {
  PresentationInput,
  PresentationCameraState,
  Description,
  Renderer,
  PresentedFrame,
  Prepared,
  RenderFrame,
  ReviewPreviewPresentationStatus,
} from './preview-presentation-state';

type PresentationSnapshot = {
  input: PresentationInput;
  cut: ReturnType<typeof useReviewCutTransitionProvider>;
  placement: QuickEditWebcamPlacement | null;
};
type Position = ReturnType<NonNullable<PresentationInput['readPosition']>>;
type Boundaries = ReturnType<typeof buildReviewPreviewBoundaries>;
type PreparedSourcePosition = {
  boundary: Boundaries[number];
  provider: PreviewSourceProvider;
  controller: AbortController;
  mapRevision: number;
  epoch: number;
  seekRevision: number | undefined;
  ready: boolean;
};
const SOURCE_PREPARATION_LEAD = 1;
const SOURCE_HANDOFF_WINDOW = 0.25;
const CUT_DEADLINE_WINDOW = 0.9;
const CUT_RENDER_LEAD = 0.126;
const TRANSITION_RENDER_LEAD = 0.175;
// Millisecond-quantized PTS can round 30 FPS source times up by half a tick.
const SOURCE_TIMESTAMP_TOLERANCE = 0.0005;
type CameraSource = ReturnType<typeof createReviewWebcamPreviewSource>;
const logger = createLogger({ namespace: 'video-review.preview' });
class PendingPresentation extends Error {
  constructor(readonly retryAfterCapture = false) {
    super();
  }
}
type Publication = {
  completed: PresentedFrame;
  prepared: Prepared;
  position?: ReturnType<NonNullable<PresentationInput['readPosition']>> | undefined;
  retain(): void;
};

export function createManualPresentationOwner(
  latest: () => PresentationSnapshot,
  report: (status: ReviewPreviewPresentationStatus) => void,
  reportBounds: (bounds: Prepared['watermarkBounds'] | null) => void,
  reportCamera: (state: PresentationCameraState) => void
) {
  return new ManualPresentationSession(latest, report, reportBounds, reportCamera);
}

/** One mounted lifetime owns renderer, publication, camera and scheduler teardown. */
class ManualPresentationSession {
  private readonly requestPositions = new WeakMap<
    object,
    ReturnType<NonNullable<PresentationInput['readPosition']>>
  >();
  private readonly cameraCaptionScenes = new WeakMap<Description['scene'], Description['scene']>();
  private requestGeneration = 0;
  private movementBase: Description | null = null;
  private movementInstance: ReviewAnnotationEffect | null = null;
  private diagnostics = createReviewExportDiagnostics({ destination: 'preview', route: 'render' });
  private diagnosed = false;
  private disposed = false;
  private waiting = false;
  private playing = false;
  private interacting = false;
  private sequence = 0;
  private current: Description | null = null;
  private cameraDescription: Description | null = null;
  private resultTime = 0;
  private front: PresentedFrame | null = null;
  private cameraSource: CameraSource | null = null;
  private cameraEvidence = 0;
  private cameraState: PresentationCameraState = { phase: 'loading', duration: 0, ready: false };
  private readonly publications: number[] = [];
  private readonly video: HTMLVideoElement | null;
  private readonly sourceIdentity: string;
  private clockActive = false;
  private readonly admission: ReturnType<typeof createPresentationAdmission>;
  private contextLost = false;
  private sourceProvider: PreviewSourceProvider | null = null;
  private readonly sourceReads = new WeakMap<PreviewSourceProvider, Promise<void>>();
  private readonly borrowedSources = new Map<PreviewSourceProvider, number>();
  private readonly retiringSources = new Set<PreviewSourceProvider>();
  private htmlSourceProvider: ReturnType<typeof createPreviewHtmlSourceProvider> | null = null;
  private boundaryPlan: {
    edits: NonNullable<PresentationInput['cut']>['edits'];
    duration: number;
    regions: Description['scene']['zoomRegions'];
    transitions: PresentationSnapshot['cut']['plans'];
    mapRevision: number;
    boundaries: Boundaries;
    segments: Readonly<ReturnType<typeof buildReviewTimeMap>>;
  } | null = null;
  private preparedSource: PreparedSourcePosition | null = null;
  private deadlineSample: Position | null = null;
  private readonly deadlineRequests = new WeakSet<object>();
  private readonly skippedRequests = new WeakSet<object>();
  private warmedBoundaries = new WeakSet<Boundaries[number]>();
  private sourceReady = false;
  private sourceUnsupported = false;
  private sourceDiscontinuity = true;
  private clockSample: { sourceTime: number; resultTime: number; position?: Position } | null =
    null;
  private sourceFrameCallback: number | null = null;
  private renderer: Renderer;
  private rendererPreference: VideoPreviewRenderer;
  private readonly scheduler: ReturnType<
    typeof createReviewPreviewPresentation<Description, Prepared, RenderFrame, Publication>
  >;

  constructor(
    private readonly latest: () => PresentationSnapshot,
    private readonly report: (status: ReviewPreviewPresentationStatus) => void,
    private readonly reportBounds: (bounds: Prepared['watermarkBounds'] | null) => void,
    private readonly reportCamera: (state: PresentationCameraState) => void
  ) {
    this.video = latest().input.video.current;
    this.sourceIdentity = latest().input.sourceIdentity;
    this.admission = createPresentationAdmission(
      () => ({ playing: this.latest().input.playing, video: this.latest().input.video.current }),
      () => this.current,
      () => this.resultTime,
      () => this.front,
      this.maximumInFlight
    );
    this.rendererPreference = this.latest().input.preferences.renderer ?? 'gpu';
    this.renderer = this.createRenderer();
    this.scheduler = createReviewPreviewPresentation({
      ...createReviewPresentationPaintClock(),
      allowPreparedPlayingFrames: true,
      canCoalesceInteraction: canCoalescePresentationInteraction,
      maximumInFlight: (description) =>
        description.renderer === 'legacy' ? 1 : this.maximumInFlight(description.scene),
      now: () => performance.now(),
      sampleTime: this.sampleTime,
      fillPlaybackDeadlines: this.fillPlaybackDeadlines,
      canCapture: (request) => !this.skippedRequests.has(request),
      publicationReady: this.publicationReady,
      prepare: this.prepare,
      capture: this.capture,
      render: this.render,
      publish: this.publish,
      onError: this.onError,
    });
    this.connectSources();
  }

  private reportClock(active: boolean) {
    if (this.clockActive === active) return;
    this.clockActive = active;
    this.latest().input.onPresentationActive?.(this.sourceIdentity, active);
  }

  private clearFront() {
    this.front?.canvas.parentElement?.replaceChildren();
    this.front?.release();
    this.front = null;
    this.latest().input.onGeometry?.(null, undefined, this.sourceIdentity);
  }

  private status(phase: ReviewPreviewPresentationStatus['phase']) {
    if (this.disposed) return;
    const last = this.publications.at(-1),
      first = this.publications[0];
    this.report({
      phase,
      ...(this.front?.renderer
        ? {
            renderer: {
              ...this.front.renderer,
              ...(this.front.renderer.backend === 'gpu' &&
              this.sourceReady &&
              !this.sourceUnsupported
                ? { decodedSourceIdentity: this.sourceIdentity }
                : {}),
            },
          }
        : {}),
      captionConflicts: this.front?.captionConflicts ?? [],
      nativeVideoFPS: null,
      actualRaster: this.front
        ? { width: this.front.canvas.width, height: this.front.canvas.height }
        : null,
      presentedFPS:
        this.playing && last !== undefined && first !== undefined && last > first
          ? ((this.publications.length - 1) * 1000) / (last - first)
          : null,
    });
  }

  private maximumInFlight = (scene: Description['scene']): 1 | 2 | 3 | 4 => {
    const deadlineSlots = this.fillPlaybackDeadlines();
    if (deadlineSlots) return deadlineSlots;
    if (
      scene.webcam?.enabled &&
      (!this.sourceReady ||
        this.sourceUnsupported ||
        !this.cameraSource?.canOverlapCapture ||
        this.front?.outputKind !== 'gpu-surface')
    )
      return 1;
    return this.renderer?.maximumInFlight(this.rendererScene(scene)) ?? 1;
  };

  private rendererScene(scene: Description['scene']): Description['scene'] {
    if (!scene.captions || !scene.webcam) return scene;
    const webcamDuration =
      this.cameraState.phase === 'ready' ? this.cameraState.duration : undefined;
    const cached = this.cameraCaptionScenes.get(scene);
    if (cached && cached.webcamDuration === webcamDuration) return cached;
    const prepared = { ...scene, webcamDuration };
    this.cameraCaptionScenes.set(scene, prepared);
    return prepared;
  }

  private createRenderer() {
    const { resources, graph } = this.admission;
    const readAsset = this.latest().input.readAsset;
    return createReviewPreviewRenderer({
      resources,
      renderer: this.rendererPreference,
      maximumInFlight: this.rendererPreference === 'gpu' ? 2 : 1,
      allowCameraCaptureOverlap: true,
      allowBoundaryStaging: this.rendererPreference === 'gpu',
      annotationExecutor: () =>
        createEffectRuntimeSandboxExecutor(
          this.rendererPreference === 'gpu' ? { compositionBackend: 'gpu-scene' } : {}
        ),
      ...(this.rendererPreference === 'gpu'
        ? {
            annotationWarmExecutor: (primary, canAdopt) =>
              this.playing
                ? (primary?.createWarmExecutor?.(canAdopt) ??
                  createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene-plan' }))
                : undefined,
          }
        : {}),
      ...(readAsset ? { readAsset } : {}),
      allocation: { describe: graph, replaceLimits: (limits) => resources.replaceLimits(limits) },
      onContextLost: () => {
        if (!this.disposed && !this.contextLost) {
          const error = new Error('Preview GPU context lost.');
          this.reportFailureContext(error);
          this.diagnostics.reportFailure(error, 'compose');
          this.diagnosed = true;
          this.contextLost = true;
          this.reportClock(false);
          this.scheduler.invalidate();
          this.status('failed');
        }
      },
    });
  }

  private sampleTime = (request?: object) => {
    let position = this.latest().input.readPosition?.();
    if (position) {
      if (!position.source || position.resultTime === null) throw new PendingPresentation();
      const liveResult = position.resultTime;
      this.prepareIncomingSource(position);
      if (request) {
        position = this.sampleCutDeadline(request, position, liveResult);
        this.requestPositions.set(request, position);
      }
      const resultTime = position.resultTime ?? liveResult;
      this.clockSample = {
        sourceTime: position.source!.mediaTime,
        resultTime,
        position,
      };
      return resultTime;
    }
    const node = this.latest().input.video.current;
    const sourceTime = node?.currentTime;
    const time = sourceTime === undefined ? null : this.latest().input.sourceToResult(sourceTime);
    if (time === null || sourceTime === undefined) throw new PendingPresentation();
    this.clockSample = { sourceTime, resultTime: time };
    return time;
  };

  private publicationReady = (request: { time: number }) => {
    if (!this.deadlineRequests.has(request)) return;
    const live = this.latest().input.readPosition?.();
    const sampled = this.requestPositions.get(request);
    if (
      !live ||
      !sampled ||
      live.epoch !== sampled.epoch ||
      live.mapRevision !== sampled.mapRevision ||
      live.resultTime === null
    )
      return true;
    return live.resultTime >= request.time;
  };

  private deadlineCut(resultTime: number) {
    if (
      this.front?.outputKind !== 'gpu-surface' ||
      this.rendererPreference !== 'gpu' ||
      this.current?.scene.webcam?.enabled ||
      this.sourceUnsupported
    )
      return;
    const plan = this.boundaryPlan;
    if (plan) return nearestReviewCut(plan.boundaries, resultTime, CUT_DEADLINE_WINDOW);
  }

  private fillPlaybackDeadlines = (): 3 | 4 | undefined => {
    if (!this.boundaryPlan || this.front?.outputKind !== 'gpu-surface') return;
    const time = this.latest().input.readPosition?.().resultTime;
    const cut = time == null ? undefined : this.deadlineCut(time);
    if (cut) return cut.kind === 'cut' ? 3 : 4;
  };

  private sampleCutDeadline(request: object, live: Position, resultTime: number): Position {
    const last = this.deadlineSample;
    const validLast =
      last?.epoch === live.epoch && last.mapRevision === live.mapRevision ? last.resultTime : null;
    const plan = this.boundaryPlan;
    const cut = this.deadlineCut(resultTime);
    if (plan?.mapRevision === live.mapRevision && cut) {
      this.deadlineRequests.add(request);
      const fps = this.current?.fps ?? 30;
      const lead = cut.kind === 'cut' ? CUT_RENDER_LEAD : TRANSITION_RENDER_LEAD;
      const time = nextReviewCutDeadline(resultTime, cut.time, fps, lead, validLast);
      if (time === null) {
        this.skippedRequests.add(request);
        return live;
      }
      const index = plan.segments.findIndex(
        (segment) =>
          segment.kind !== 'cut' && segment.resultStart <= time && time < segment.resultEnd
      );
      const segment = plan.segments[index];
      const blend = this.latest().cut.read(time, false);
      if (segment && segment.kind !== 'freeze' && (!blend || blend.frames)) {
        const segmentId = `video:${index}`;
        if (
          segmentId === live.source?.segmentId ||
          (this.preparedSource?.ready &&
            this.preparedSource.boundary.incoming?.segmentId === segmentId)
        ) {
          const sourceTime = reviewSegmentSourceTime(segment, time);
          const mediaTime =
            sourceTime + SOURCE_TIMESTAMP_TOLERANCE < segment.sourceEnd
              ? sourceTime + SOURCE_TIMESTAMP_TOLERANCE
              : sourceTime;
          const sampled: Position = {
            ...live,
            resultTime: time,
            source: { kind: 'video', sourceTime, mediaTime, segmentId },
          };
          this.deadlineSample = sampled;
          return sampled;
        }
      }
    }
    if (validLast !== null && resultTime <= validLast) this.skippedRequests.add(request);
    else this.deadlineSample = null;
    return live;
  }

  private prepare = async (
    request: { scene: Description; generation: string; time: number },
    signal: AbortSignal
  ) => {
    const position = this.latest().input.readPosition?.();
    if (position) this.requestPositions.set(request, { ...position });
    if (position && (!position.source || position.resultTime === null))
      throw new PendingPresentation();
    if (this.contextLost) throw new Error('Preview context lost');
    if (this.latest().input.backgroundPending) throw new PendingPresentation();
    const rendererPreference = request.scene.renderer ?? 'gpu';
    if (this.rendererPreference !== rendererPreference) {
      // The presentation scheduler drains the previous render before preparing this scene.
      this.renderer.dispose();
      this.resetSource();
      this.rendererPreference = rendererPreference;
      this.renderer = this.createRenderer();
      this.admission.resetAssets();
    }
    if (this.cameraDescription !== request.scene) {
      prepareReviewCameraPlans(request.scene.scene.zoomRegions, {
        ...request.scene.scene,
        output: request.scene.dimensions.backing,
      });
      this.cameraDescription = request.scene;
    }
    this.current = request.scene;
    // This session emits decimal generation values; capture keeps the admitted job's sequence.
    this.sequence = Number(request.generation);
    this.resultTime =
      this.latest().input.playing && this.video
        ? (position?.resultTime ??
          this.latest().input.sourceToResult(this.video.currentTime) ??
          request.time)
        : request.time;
    // Independent providers need metadata; only direct HTML capture waits for its native seek.
    if (
      !this.video ||
      (this.video.seeking && !this.canDecodeSource()) ||
      this.video.readyState < (this.canDecodeSource() ? 1 : 2)
    )
      throw new PendingPresentation();
    if (this.canDecodeSource() && !this.sourceReady)
      await this.prepareSource(
        this.latest().input.playing
          ? (position?.source?.mediaTime ?? this.video.currentTime)
          : request.scene.sourceTime,
        signal
      );
    signal.throwIfAborted();
    const transition = this.latest().cut.read(this.resultTime);
    if (transition?.failed) throw new Error('Transition preview unavailable');
    if (transition && (!transition.frames || !transition.lease?.active))
      throw new PendingPresentation();
    const current = request.scene;
    const moved = request.scene.annotationMove;
    let retained =
      moved &&
      this.renderer.prepareAnnotationMove(
        moved.baseline,
        moved.instance,
        current.dimensions,
        signal
      );
    if (moved && !retained && this.rendererPreference === 'gpu') {
      const baseline = await this.renderer.prepare(moved.baseline, current.dimensions, signal);
      baseline.release();
      retained = this.renderer.prepareAnnotationMove(
        moved.baseline,
        moved.instance,
        current.dimensions,
        signal
      );
    }
    const prepared =
      retained ??
      (await reviewExportPhase(signal, 'prepare', () =>
        this.renderer.prepare(this.rendererScene(current.scene), current.dimensions, signal)
      ));
    this.admission.replaceAssets(prepared.allocationAssets);
    return { value: prepared, release: () => prepared.release() };
  };

  private capture = (prepared: Prepared, time: number, signal: AbortSignal) => {
    const video = this.video;
    const description = this.current;
    if (
      !description ||
      !video ||
      (video.seeking && !this.canDecodeSource()) ||
      video.readyState < (this.canDecodeSource() ? 1 : 2)
    )
      throw new PendingPresentation();
    this.resultTime = time;
    const cut = this.latest().cut;
    const liveResult = this.latest().input.readPosition?.().resultTime;
    if (liveResult != null && liveResult < time) cut.read(liveResult);
    const transition = cut.read(time, liveResult == null || liveResult >= time);
    if (transition?.failed) throw new Error('Transition preview unavailable');
    if (transition && (!transition.frames || !transition.lease?.active))
      throw new PendingPresentation();
    const borrow = transition?.lease?.retain();
    if (!borrow) return this.captureFrame(description, video, prepared, time, transition, signal);
    const attach = (frame: { value: RenderFrame; release(): void }) => ({
      value: frame.value,
      release() {
        try {
          frame.release();
        } finally {
          borrow();
        }
      },
    });
    try {
      const captured = this.captureFrame(description, video, prepared, time, transition, signal);
      return captured instanceof Promise
        ? captured.then(attach, (error: unknown) => {
            borrow();
            throw error;
          })
        : attach(captured);
    } catch (error) {
      borrow();
      throw error;
    }
  };

  private captureFrame(
    description: Description,
    video: HTMLVideoElement,
    prepared: Prepared,
    time: number,
    transition: Parameters<typeof captureReviewPreviewFrame>[0]['transition'],
    signal: AbortSignal
  ) {
    const sourceTime = this.latest().input.playing
      ? this.clockSample?.resultTime === time
        ? this.clockSample.sourceTime
        : video.currentTime
      : description.sourceTime;
    const snapshot = this.latest();
    const cameraSource = this.cameraSource;
    const cameraState = this.cameraState;
    const args = {
      video,
      description,
      sequence: this.sequence,
      time,
      transition,
      sourceTime: () => sourceTime,
      reserveSource: (bytes: number) =>
        this.admission.reserveSource(bytes, prepared.allocationAssets),
      captureCamera: () => undefined,
    };
    // Compatibility pixels freeze before camera acquisition can yield to another HTML tick.
    const primary = this.canDecodeSource() ? undefined : captureReviewPreviewFrame(args);
    if (primary === null) {
      if (
        this.sourceFrameCallback === null &&
        typeof video.requestVideoFrameCallback === 'function'
      )
        this.sourceFrameCallback = video.requestVideoFrameCallback(() => {
          this.sourceFrameCallback = null;
          this.ready();
        });
      throw new PendingPresentation();
    }
    if (!snapshot.input.webcam) {
      this.cancelSourceFrameCallback();
      return primary ?? this.captureDecoded(args, sourceTime, signal);
    }
    return (async () => {
      let captured = primary;
      let camera: Awaited<ReturnType<typeof capturePresentationCamera>>;
      const evidence = this.cameraEvidence;
      try {
        camera = await capturePresentationCamera(
          snapshot,
          sourceTime,
          time,
          cameraState,
          cameraSource,
          this.admission.cameraResources,
          signal
        );
        signal.throwIfAborted();
        if (this.disposed || this.cameraSource !== cameraSource) throw new PendingPresentation();
        captured ??= await this.captureDecoded(args, sourceTime, signal);
        signal.throwIfAborted();
        const primaryFrame = captured;
        const cameraFrame = camera;
        captured = undefined;
        camera = undefined;
        const result = attachReviewPreviewCamera(primaryFrame, cameraFrame);
        this.cancelSourceFrameCallback();
        return result;
      } catch (error) {
        if (
          error instanceof PendingPresentation &&
          !this.disposed &&
          this.cameraSource === cameraSource &&
          evidence !== this.cameraEvidence
        )
          throw new PendingPresentation(true);
        throw error;
      } finally {
        camera?.release();
        captured?.release();
      }
    })();
  }

  private releasePreparedSource() {
    const prepared = this.preparedSource;
    this.preparedSource = null;
    prepared?.controller.abort();
    prepared?.provider.dispose();
  }

  private matchesPreparation(prepared: PreparedSourcePosition, position: Position) {
    return (
      position.epoch === prepared.epoch &&
      position.mapRevision === prepared.mapRevision &&
      this.latest().input.seekRevision === prepared.seekRevision
    );
  }

  private prepareIncomingSource(position: Position) {
    const { input, cut } = this.latest();
    const binding = input.cut;
    const now = position.resultTime;
    if (
      !input.playing ||
      !binding ||
      now === null ||
      !this.sourceReady ||
      this.sourceUnsupported ||
      this.rendererPreference !== 'gpu'
    )
      return;
    const acceptedMap = binding.readTimeMap?.();
    if (acceptedMap && acceptedMap.mapRevision !== position.mapRevision) {
      this.boundaryPlan = null;
      this.releasePreparedSource();
      return;
    }
    const edits = acceptedMap?.edits ?? binding.edits;
    const duration = acceptedMap?.duration ?? binding.duration;
    const regions = this.current?.scene.zoomRegions ?? input.scene.zoomRegions;
    if (
      !this.boundaryPlan ||
      this.boundaryPlan.mapRevision !== position.mapRevision ||
      this.boundaryPlan.edits !== edits ||
      this.boundaryPlan.duration !== duration ||
      this.boundaryPlan.regions !== regions ||
      this.boundaryPlan.transitions !== cut.plans
    ) {
      this.warmedBoundaries = new WeakSet();
      const segments = acceptedMap?.segments ?? buildReviewTimeMap(duration, edits);
      this.boundaryPlan = {
        segments,
        mapRevision: position.mapRevision,
        edits,
        duration,
        regions,
        transitions: cut.plans,
        boundaries: buildReviewPreviewBoundaries(segments, cut.plans, regions),
      };
    }
    const prepared = this.preparedSource;
    if (
      prepared &&
      this.matchesPreparation(prepared, position) &&
      now <= prepared.boundary.time + SOURCE_HANDOFF_WINDOW
    )
      return;
    this.releasePreparedSource();
    const boundary = this.boundaryPlan?.boundaries.find(
      (item) => item.incoming && item.time > now && item.time <= now + SOURCE_PREPARATION_LEAD
    );
    if (!boundary?.incoming) return;
    const owner: PreparedSourcePosition = {
      boundary,
      provider: createPreviewSourceProvider(),
      controller: new AbortController(),
      mapRevision: position.mapRevision,
      epoch: position.epoch,
      seekRevision: input.seekRevision,
      ready: false,
    };
    this.preparedSource = owner;
    void owner.provider
      .acquire([this.sourceDemand(boundary.incoming.time)], owner.controller.signal)
      .then(
        (lease) => {
          if (this.preparedSource === owner) owner.ready = lease !== null;
          lease?.release();
        },
        () => {
          // A speculative decoder failure leaves the current decoder responsible for capture.
        }
      );
  }

  private promotePreparedSource(time: number) {
    const prepared = this.preparedSource;
    if (!prepared?.ready) return;
    const position = this.clockSample?.position;
    const current = this.latest().input.readPosition?.();
    const incoming = prepared.boundary.incoming;
    if (
      !position ||
      !current ||
      !incoming ||
      current.source?.segmentId !== incoming.segmentId ||
      !this.matchesPreparation(prepared, current) ||
      !this.matchesPreparation(prepared, position) ||
      position.source?.segmentId !== incoming.segmentId ||
      position.source.mediaTime !== time ||
      time < incoming.time ||
      !this.latest().input.playing
    )
      return;
    this.preparedSource = null;
    const previous = this.sourceProvider;
    this.sourceProvider = prepared.provider;
    this.sourceDiscontinuity = false;
    if (previous && this.borrowedSources.has(previous)) this.retiringSources.add(previous);
    else previous?.dispose();
  }

  private canDecodeSource() {
    return typeof VideoDecoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  }

  private resetSource() {
    this.releasePreparedSource();
    this.warmedBoundaries = new WeakSet();
    this.sourceProvider?.dispose();
    for (const provider of this.retiringSources) provider.dispose();
    this.retiringSources.clear();
    this.sourceProvider = null;
    this.htmlSourceProvider?.dispose();
    this.htmlSourceProvider = null;
    this.sourceReady = this.sourceUnsupported = false;
    this.sourceDiscontinuity = true;
    this.clockSample = null;
    this.deadlineSample = null;
  }

  private sourceDemand(time: number): PreviewSourceDemand {
    const duration = this.video?.duration;
    // Native duration rounds to microseconds; the accepted endpoint retains container precision.
    // Match the source owner's two-microsecond rounding only at that terminal sampling boundary.
    const sampleTime =
      duration !== undefined &&
      Number.isFinite(duration) &&
      duration > 0 &&
      time > duration &&
      time - duration <= 0.000002
        ? duration
        : time;
    return {
      id: 'source',
      url: this.sourceIdentity,
      time: sampleTime,
      rangeStart: 0,
      ...(duration !== undefined && Number.isFinite(duration) && duration > 0
        ? { rangeEnd: duration, holdEnd: true }
        : {}),
    };
  }

  private async prepareSource(time: number, signal: AbortSignal) {
    const provider = (this.sourceProvider ??= createPreviewSourceProvider());
    let lease: PreparedPreviewSourceLease | null = null;
    const demand = this.sourceDemand(time);
    try {
      if (!this.sourceUnsupported)
        lease = await provider.acquire([demand], signal, { discontinuity: true });
      signal.throwIfAborted();
      if (this.disposed || this.sourceProvider !== provider) throw new PendingPresentation();
      if (!lease) {
        this.sourceUnsupported = true;
        const html = (this.htmlSourceProvider ??= createPreviewHtmlSourceProvider());
        lease = await html.acquire([demand], signal);
        signal.throwIfAborted();
        if (this.disposed || this.sourceProvider !== provider || this.htmlSourceProvider !== html)
          throw new PendingPresentation();
      }
      this.sourceReady = true;
    } finally {
      lease?.release();
    }
  }

  private async captureDecoded(
    args: Parameters<typeof captureReviewPreviewFrame>[0],
    sourceTime: number,
    signal: AbortSignal
  ) {
    this.promotePreparedSource(sourceTime);
    const incoming = this.preparedSource;
    const sampled = this.clockSample?.position;
    const futureProvider =
      incoming?.ready &&
      sampled?.source?.mediaTime === sourceTime &&
      sampled.resultTime === args.time &&
      sampled.source.segmentId === incoming.boundary.incoming?.segmentId &&
      this.matchesPreparation(incoming, sampled)
        ? incoming.provider
        : null;
    const provider = futureProvider ?? this.sourceProvider;
    if (!provider) throw new PendingPresentation();
    signal.throwIfAborted();
    let lease: PreparedPreviewSourceLease | null = null;
    const html = this.htmlSourceProvider;
    const discontinuity =
      !futureProvider && (this.sourceDiscontinuity || !this.latest().input.playing);
    this.sourceDiscontinuity = false;
    const predecessor = this.sourceReads.get(provider);
    let finishRead!: () => void;
    const reading = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    this.sourceReads.set(provider, reading);
    this.borrowedSources.set(provider, (this.borrowedSources.get(provider) ?? 0) + 1);
    try {
      // The provider replaces queued interest. Give each admitted frame its turn to decode.
      if (predecessor) await predecessor;
      signal.throwIfAborted();
      if (this.sourceUnsupported) {
        if (!html) throw new PendingPresentation();
        lease = await html.acquire([this.sourceDemand(sourceTime)], signal);
      } else
        lease = await provider.acquire([this.sourceDemand(sourceTime)], signal, { discontinuity });
      signal.throwIfAborted();
      if (
        this.disposed ||
        (this.sourceProvider !== provider &&
          this.preparedSource?.provider !== provider &&
          !this.retiringSources.has(provider)) ||
        (this.sourceUnsupported && this.htmlSourceProvider !== html)
      )
        throw new PendingPresentation();
      const binding = lease?.bindings.get('source');
      if (!binding || !lease) throw new Error('Preview source frame is unavailable.');
      const ownedSource = lease;
      lease = null;
      const captured = captureDecodedReviewPreviewFrame({
        ...args,
        binding,
        releaseSource: () => ownedSource.release(),
        captureCamera: () => undefined,
      });
      this.cancelSourceFrameCallback();
      return captured;
    } finally {
      finishRead();
      if (this.sourceReads.get(provider) === reading) this.sourceReads.delete(provider);
      lease?.release();
      const borrowed = this.borrowedSources.get(provider)! - 1;
      if (borrowed) this.borrowedSources.set(provider, borrowed);
      else {
        this.borrowedSources.delete(provider);
        if (this.retiringSources.delete(provider)) provider.dispose();
      }
    }
  }

  private cancelSourceFrameCallback() {
    if (this.sourceFrameCallback === null) return;
    this.video?.cancelVideoFrameCallback(this.sourceFrameCallback);
    this.sourceFrameCallback = null;
  }

  private upcomingGpuBoundary(frame: RenderFrame) {
    if (!this.playing || !this.boundaryPlan) return;
    if (this.current?.scene.annotationEffects?.lane.enabled) return;
    const period = 1 / (frame.fps ?? 30);
    const candidate = this.boundaryPlan.boundaries.find(
      (boundary) =>
        boundary.time >= frame.resultTime + period * 2 &&
        boundary.time <= frame.resultTime + SOURCE_PREPARATION_LEAD &&
        !this.warmedBoundaries.has(boundary)
    );
    if (!candidate) return;
    const resultTime = candidate.time + period / 2;
    const transition = this.latest().cut.read(resultTime, false);
    if (transition && (!transition.frames || !transition.lease?.active)) return;
    this.warmedBoundaries.add(candidate);
    return {
      value: {
        resultTime,
        ...(transition?.frames
          ? { transition: { blend: transition.blend, frames: transition.frames } }
          : {}),
      },
      release: transition?.lease?.retain(),
    };
  }

  private render = async (
    prepared: Prepared,
    frame: RenderFrame,
    request: { deadlineSlots?: 3 | 4 },
    signal: AbortSignal
  ) => {
    const boundary = this.upcomingGpuBoundary(frame);
    const presentationFrame = {
      ...frame,
      playback: this.playing,
      ...(request.deadlineSlots ? { deadlineSlots: request.deadlineSlots } : {}),
      ...(boundary ? { boundary: boundary.value } : {}),
    };
    const completed = await reviewExportPhase(signal, 'compose', () =>
      this.renderer.renderPresentation(prepared, presentationFrame, signal, (size, backend) => {
        const host = this.latest().input.host.current;
        if (!host || this.disposed) throw new PendingPresentation();
        const output = this.admission.resources.presentationCanvas(size, backend);
        try {
          if (output.canvas.parentElement !== host) {
            this.attachCanvas(host, output.canvas);
          }
          return output;
        } catch (error) {
          output.release();
          throw error;
        }
      })
    ).finally(() => boundary?.release?.());
    let transferred = false;
    return {
      value: {
        completed,
        prepared,
        position: this.requestPositions.get(request),
        retain() {
          transferred = true;
        },
      },
      release() {
        if (!transferred) completed.release();
      },
    };
  };

  private attachCanvas(host: HTMLDivElement, canvas: HTMLCanvasElement) {
    canvas.className = 'pointer-events-none absolute inset-0 h-full w-full';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.opacity = '0';
    canvas.style.willChange = 'opacity';
    canvas.style.backgroundColor = '#000';
    host.appendChild(canvas);
  }

  private publishCanvas(host: HTMLDivElement, value: Publication) {
    const canvas = value.completed.canvas;
    const previous = this.front;
    if (canvas.parentElement !== host) this.attachCanvas(host, canvas);
    canvas.style.opacity = '1';
    canvas.dataset['previewFront'] = 'true';
    if (previous && previous.canvas !== canvas) {
      previous.canvas.style.opacity = '0';
      previous.canvas.dataset['previewFront'] = 'false';
    }
    // The deadline queue can retain one output beyond the two ordinary WebGPU requests.
    const ordinaryHidden = this.rendererPreference === 'gpu' ? 2 : 1;
    const maximumHidden = this.fillPlaybackDeadlines() ?? ordinaryHidden;
    let hidden = 0;
    for (const child of [...host.children])
      if (
        child !== canvas &&
        (!(child instanceof HTMLCanvasElement) ||
          child.width !== canvas.width ||
          child.height !== canvas.height ||
          hidden++ >= maximumHidden)
      )
        child.remove();
    this.front = value.completed;
    value.retain();
    previous?.release();
  }

  private publish = (value: Publication) => {
    const position = this.latest().input.readPosition?.();
    if (
      value.position &&
      (!position ||
        value.position.epoch !== position.epoch ||
        value.position.mapRevision !== position.mapRevision)
    )
      throw new PendingPresentation();
    if (
      this.playing &&
      this.rendererPreference === 'gpu' &&
      value.position?.source &&
      value.position.source.segmentId !== position?.source?.segmentId
    )
      return false as const;
    const host = this.latest().input.host.current;
    if (!host) throw new PendingPresentation();
    this.publishCanvas(host, value);
    this.waiting = false;
    if (this.diagnosed) {
      this.diagnostics = createReviewExportDiagnostics({ destination: 'preview', route: 'render' });
      this.diagnosed = false;
    }
    const input = this.latest().input;
    const cadenceRequested = input.preferences.showFrameRate || input.onStatistics !== undefined;
    if (this.playing && cadenceRequested) this.publications.push(performance.now());
    if (!cadenceRequested) this.publications.length = 0;
    while (this.publications.length > 2 && this.publications[0]! < performance.now() - 1000)
      this.publications.shift();
    this.reportClock(this.playing && value.completed.geometry != null);
    this.latest().input.onGeometry?.(
      value.completed.geometry ?? null,
      value.completed.sourceTime,
      this.sourceIdentity
    );
    this.reportBounds(value.prepared.watermarkBounds);
    this.status('ready');
  };

  private onError = (error: unknown) => {
    this.waiting = error instanceof PendingPresentation;
    this.reportClock(false);
    if (!this.waiting) {
      this.reportFailureContext(error);
      this.diagnostics.reportFailure(error);
      this.diagnosed = true;
    }
    this.status(this.waiting ? 'pending' : 'failed');
    if (error instanceof PendingPresentation && error.retryAfterCapture) this.ready();
  };

  private reportFailureContext(error: unknown) {
    if (!import.meta.env.DEV || globalThis.__SNIPTALE_RELEASE_BUILD__ === true || this.diagnosed)
      return;
    try {
      const position = this.latest().input.readPosition?.();
      const finite = (value: number | undefined) =>
        value !== undefined && Number.isFinite(value) ? value : null;
      logger.warn('Presentation failed.', {
        ...previewFailureCategory(error),
        renderer: this.rendererPreference,
        sourceTime: finite(this.clockSample?.sourceTime ?? this.current?.sourceTime),
        resultTime: finite(this.resultTime),
        epoch: finite(position?.epoch),
        mapRevision: finite(position?.mapRevision),
        nativeTime: finite(this.video?.currentTime),
        nativeDuration: finite(this.video?.duration),
        nativeReadyState: this.video?.readyState ?? null,
        nativeSeeking: this.video?.seeking ?? null,
        nativePaused: this.video?.paused ?? null,
        frameWidth: finite(this.front?.canvas.width),
        frameHeight: finite(this.front?.canvas.height),
      });
    } catch {
      // Advisory diagnostics must not replace the presentation failure.
    }
  }

  readonly ready = () => {
    if (!this.disposed && this.waiting) {
      this.waiting = false;
      this.reportClock(this.playing && !this.contextLost);
      this.scheduler.invalidate();
    }
  };

  private seeking = () => {
    const position = this.latest().input.readPosition?.();
    const captured = this.clockSample?.position;
    // The decoded preview follows the transport. Correcting its native audio element cannot
    // invalidate a frame request from the same transport command and map.
    if (
      this.playing &&
      this.rendererPreference === 'gpu' &&
      !this.video?.paused &&
      this.sourceReady &&
      !this.sourceUnsupported &&
      position?.source &&
      captured?.epoch === position.epoch &&
      captured.mapRevision === position.mapRevision
    )
      return;
    if (
      this.preparedSource &&
      (!position || !this.matchesPreparation(this.preparedSource, position))
    )
      this.releasePreparedSource();
    this.sourceDiscontinuity = true;
    this.renderer.cancelWarmAnnotations?.();
    this.publications.length = 0;
    this.waiting = true;
    this.reportClock(false);
    this.scheduler.invalidate();
    this.status('pending');
  };

  private connectSources() {
    for (const event of ['loadedmetadata', 'loadeddata', 'seeked', 'timeupdate'])
      this.video?.addEventListener(event, this.ready);
    this.video?.addEventListener('seeking', this.seeking);
    this.connectCamera();
  }

  private connectCamera() {
    const webcam = this.latest().input.webcam;
    if (!this.video || !webcam) return;
    this.cameraSource = createReviewWebcamPreviewSource(
      this.video,
      webcam.settings.assetId,
      () => this.latest().input.webcam!.settings,
      {
        evidenceChanged: () => {
          if (this.disposed) return;
          this.cameraEvidence++;
          this.ready();
        },
        ready: (visible) => {
          if (this.disposed) return;
          this.cameraState = { ...this.cameraState, ready: visible };
          this.reportCamera(this.cameraState);
          this.ready();
        },
        loaded: (duration) => {
          if (this.disposed) return;
          this.cameraState = { ...this.cameraState, phase: 'ready', duration };
          this.reportCamera(this.cameraState);
          this.latest().input.webcam?.onResourceReady?.();
          this.ready();
        },
        failed: () => {
          if (this.disposed) return;
          this.cameraState = { phase: 'failed', duration: 0, ready: false };
          this.reportCamera(this.cameraState);
          this.scheduler.invalidate();
        },
      }
    );
  }

  retainEndpoints(bytes: readonly [number, number]) {
    if (this.disposed) throw new Error('Preview endpoint admission unavailable');
    return this.admission.retainEndpoints(bytes);
  }

  moveAnnotation(instance: ReviewAnnotationEffect): boolean {
    const input = this.latest().input;
    const baseline = this.movementBase ?? this.current;
    if (
      this.disposed ||
      this.playing ||
      input.playing ||
      this.rendererPreference !== 'gpu' ||
      !input.annotationGesture ||
      input.annotationGesture.id !== instance.id ||
      !baseline?.interactionKey ||
      this.contextLost
    )
      return false;
    const annotations = baseline.scene.annotationEffects;
    if (!annotations?.lane.instances.some((entry) => entry.id === instance.id)) return false;
    this.movementBase = baseline;
    this.movementInstance = instance;
    const scene = {
      ...baseline.scene,
      annotationEffects: {
        ...annotations,
        lane: {
          ...annotations.lane,
          instances: annotations.lane.instances.map((entry) =>
            entry.id === instance.id ? instance : entry
          ),
        },
      },
    };
    this.update(
      { ...baseline, scene, annotationMove: { baseline: baseline.scene, instance } },
      this.requestGeneration + 1,
      true
    );
    return true;
  }

  endAnnotationMovement() {
    if (!this.movementBase) return;
    this.movementBase = null;
    this.movementInstance = null;
    this.scheduler.invalidate();
  }

  update(description: Description, generation: number, interacting: boolean, active = true) {
    generation = this.requestGeneration = Math.max(this.requestGeneration + 1, generation);
    interacting = interacting || !!this.latest().input.annotationGesture;
    if (!description.annotationMove) {
      const baseline = this.movementBase,
        instance = this.movementInstance;
      const input = this.latest().input;
      if (
        active &&
        baseline &&
        instance &&
        input.annotationGesture?.id === instance.id &&
        canCoalescePresentationInteraction(baseline, description) &&
        description.scene.annotationEffects
      ) {
        const annotations = description.scene.annotationEffects;
        description = {
          ...description,
          scene: {
            ...description.scene,
            annotationEffects: {
              ...annotations,
              lane: {
                ...annotations.lane,
                instances: annotations.lane.instances.map((entry) =>
                  entry.id === instance.id ? instance : entry
                ),
              },
            },
          },
          annotationMove: { baseline: baseline.scene, instance },
        };
      } else {
        this.movementBase = null;
        this.movementInstance = null;
      }
    }
    if (
      this.current !== description ||
      this.sequence !== generation ||
      !active ||
      !this.latest().input.playing
    )
      this.renderer.cancelWarmAnnotations?.();
    const input = this.latest().input;
    const coalescing =
      active &&
      !input.playing &&
      interacting &&
      this.interacting &&
      this.current &&
      canCoalescePresentationInteraction(this.current, description);
    if (!coalescing) {
      if (this.current !== description) {
        this.releasePreparedSource();
        this.boundaryPlan = null;
        this.deadlineSample = null;
      }
      this.current = description;
      this.sequence = generation;
    }
    this.interacting = interacting;
    const deferFrames = !input.playing && !!input.deferFrames;
    if (this.playing !== input.playing || !active) this.publications.length = 0;
    this.playing = active && input.playing;
    if (!this.playing) {
      this.warmedBoundaries = new WeakSet();
      this.deadlineSample = null;
    }
    const position = this.preparedSource && input.readPosition?.();
    if (
      this.preparedSource &&
      (!this.playing ||
        description.renderer === 'legacy' ||
        !position ||
        !this.matchesPreparation(this.preparedSource, position))
    )
      this.releasePreparedSource();
    this.reportClock(this.playing && !this.waiting && !this.diagnosed && !this.contextLost);
    this.scheduler.update({
      scene: description,
      generation: String(generation),
      visible: active && !deferFrames,
      playing: input.playing,
      interacting,
      frameRate:
        input.preferences.frameRate === 'current' ? null : Number(input.preferences.frameRate),
      detailedPaused: input.preferences.pausedQuality === 'detailed',
      pausedTime: input.pausedResultTime,
    });
    if (!active) {
      this.clearFront();
      this.cancelSourceFrameCallback();
      this.cameraSource?.dispose();
      this.cameraSource = null;
      this.cameraState = { phase: 'loading', duration: 0, ready: false };
    } else if (!this.cameraSource) {
      this.connectCamera();
    }
    this.status(active ? (deferFrames && this.front ? 'ready' : 'pending') : 'inactive');
  }

  retry() {
    this.diagnostics = createReviewExportDiagnostics({ destination: 'preview', route: 'render' });
    this.diagnosed = false;
    this.cancelSourceFrameCallback();
    this.waiting = false;
    this.scheduler.invalidate();
    this.renderer.dispose();
    this.resetSource();
    this.renderer = this.createRenderer();
    this.admission.resetAssets();
    this.contextLost = false;
    this.reportClock(this.playing);
    this.status('pending');
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.reportClock(false);
    this.cancelSourceFrameCallback();
    this.scheduler.dispose();
    this.resetSource();
    for (const event of ['loadedmetadata', 'loadeddata', 'seeked', 'timeupdate'])
      this.video?.removeEventListener(event, this.ready);
    this.video?.removeEventListener('seeking', this.seeking);
    this.cameraSource?.dispose();
    this.clearFront();
    this.renderer.dispose();
    this.admission.resources.dispose();
  }
}

/** Only closed cause codes and operation names can leave the presentation owner. */
function previewFailureCategory(error: unknown) {
  const messages = new Map([
    ['Preview source frame is unavailable.', 'source-unavailable'],
    ['Transition preview unavailable', 'transition-unavailable'],
    ['Camera preview unavailable', 'camera-unavailable'],
    ['Invalid presentation time', 'invalid-time'],
    ['Preview GPU context lost.', 'gpu-context-lost'],
    ['Effect runtime resource limit exceeded', 'resource-limit'],
    ['GPU preview overlap is unavailable.', 'gpu-overlap'],
    ['GPU preview already has a frame in flight.', 'gpu-capacity'],
    ['Preview frame is already admitted.', 'frame-capacity'],
    ['Preview scene is stale.', 'scene-stale'],
    ['Preview renderer is disposed.', 'renderer-disposed'],
    ['Preview output context is unavailable.', 'output-unavailable'],
    ['Preview spatial preparation is unavailable.', 'spatial-unavailable'],
    ['Invalid preview frame time.', 'invalid-frame-time'],
    ['Invalid preview dimensions.', 'invalid-dimensions'],
    ['Transition source timestamp is unavailable.', 'transition-timestamp'],
    ['Transition GPU pixels are unavailable.', 'transition-pixels'],
    ['GL transition settings are unavailable.', 'transition-settings'],
    ['Camera GPU pixels are unavailable.', 'camera-pixels'],
    ['Annotation GPU source is unavailable.', 'annotation-pixels'],
    ['Enhanced GPU source pixels are unavailable.', 'enhanced-source'],
    ['Export enhancement source timestamp is unavailable.', 'enhanced-timestamp'],
    ['Preview window projection is unavailable.', 'window-projection'],
    ['Preview projection is unavailable.', 'projection'],
    ['GPU preview queue failed.', 'gpu-queue'],
    ['GPU CSS filter resource budget exceeded.', 'gpu-filter-budget'],
    ['GPU content identity budget exceeded.', 'gpu-content-budget'],
    ['GPU content identity is unavailable.', 'gpu-content-identity'],
    ['GPU preview texture budget exceeded.', 'gpu-texture-budget'],
    ['GPU preview filter texture budget exceeded.', 'gpu-filter-texture-budget'],
    ['GPU preview cache key has conflicting sources.', 'gpu-cache-conflict'],
    ['GPU preview filter key has conflicting sources or contents.', 'gpu-filter-cache-conflict'],
    ['GPU CSS filter key has conflicting sources.', 'gpu-css-cache-conflict'],
    ['GPU presentation storage budget exceeded.', 'gpu-presentation-budget'],
    ['GPU presentation surface capacity exceeded.', 'gpu-surface-capacity'],
    ['GPU presentation surface already has a frame in flight.', 'gpu-surface-busy'],
    ['GPU presentation image is still pending.', 'gpu-image-pending'],
    ['GPU presentation backing size changed.', 'gpu-backing-changed'],
    ['GPU presentation destination was not acquired.', 'gpu-destination-missing'],
    ['GPU preview layer budget exceeded.', 'gpu-layer-budget'],
    ['GPU paint data budget exceeded.', 'gpu-paint-budget'],
    ['GPU source is not a raster.', 'gpu-source-kind'],
  ]);
  const causes: Error[] = [];
  for (let value = error; value instanceof Error && causes.length < 4; value = value.cause)
    causes.push(value);
  const reason =
    causes.map((cause) => messages.get(cause.message)).find(Boolean) ??
    (causes.some((cause) => cause.name === 'GpuPreviewValidationError')
      ? 'gpu-validation'
      : causes.some((cause) => cause.name === 'GpuPreviewDeviceError')
        ? 'gpu-device'
        : causes.some((cause) =>
              /^GPU (preview|presentation|source|paint|content|CSS)\b/.test(cause.message)
            )
          ? 'gpu-contract'
          : 'unclassified');
  const errorType =
    causes
      .map((cause) => cause.name)
      .find((name) =>
        [
          'TypeError',
          'RangeError',
          'EncodingError',
          'OperationError',
          'InvalidStateError',
          'NotSupportedError',
          'QuotaExceededError',
          'SecurityError',
          'EffectRuntimeResourceError',
          'GpuPreviewValidationError',
          'GpuPreviewDeviceError',
        ].includes(name)
      ) ?? 'Error';
  const operations = [
    'validatePreviewSourceDemands',
    'resolvePreviewSourceRequest',
    'resolvePreviewSourceOrdinaryTime',
    'PreviewSourceOwner.select',
    'PreviewSourceOwner.advance',
    'PreviewSourceOwner.restart',
    'captureDecodedReviewPreviewFrame',
    'capturePresentationCamera',
    'ManualPresentationSession.prepare',
    'ManualPresentationSession.capture',
    'ManualPresentationSession.render',
    'ManualPresentationSession.publish',
  ].filter((operation) => causes.some((cause) => cause.stack?.includes(operation)));
  const gpuOperations = [
    'copyExternalImageToTexture',
    'copyBufferToTexture',
    'copyTextureToTexture',
    'writeTexture',
    'createBindGroup',
    'setBindGroup',
    'setPipeline',
    'createTexture',
    'submit',
    'draw',
    'destroyed',
    'different device',
    'out of bounds',
    'incompatible',
    'VideoFrame',
  ].filter((operation) =>
    causes.some(
      (cause) =>
        cause.name === 'GpuPreviewValidationError' &&
        cause.message.toLowerCase().includes(operation.toLowerCase())
    )
  );
  const gpuDetails = [
    'geometry',
    'dimensions',
    'cache',
    'texture',
    'surface',
    'layer',
    'paint',
    'filter',
    'raster',
    'pipeline',
    'groups',
    'transition',
    'source',
    'uniform',
    'orientation',
    'lens',
    'tint',
    'disposed',
    'active',
    'pending',
    'invalid',
    'unavailable',
  ].filter((detail) =>
    causes.some(
      (cause) =>
        /^GPU (preview|presentation|source|paint|content|CSS)\b/.test(cause.message) &&
        cause.message.toLowerCase().includes(detail)
    )
  );
  return { reason, errorType, operations, gpuOperations, gpuDetails };
}

/** Camera readiness is independent of the atomic source-frame lease and native transport. */
async function capturePresentationCamera(
  snapshot: PresentationSnapshot,
  sourceTime: number,
  resultTime: number,
  state: PresentationCameraState,
  source: CameraSource | null,
  resources: RenderResources,
  signal: AbortSignal
) {
  const binding = snapshot.input.webcam;
  if (!binding) return undefined;
  if (state.phase === 'failed') throw new Error('Camera preview unavailable');
  if (state.phase !== 'ready' || !source) throw new PendingPresentation();
  const mapped = quickEditWebcamFrameAt(binding.settings, sourceTime, state.duration, resultTime);
  if (!mapped) return undefined;
  const screen = quickEditWebcamScreenPlacementAt(binding.settings, sourceTime, resultTime);
  const split = screen.width < 1 || screen.height < 1 || !!screen.clip || !!screen.cameraOverlay;
  const selected =
    !binding.disabled && ['webcam', 'webcam-position'].includes(binding.editor.selection.kind);
  const result = await source.captureFrame(
    {
      sourceTime,
      resultTime,
      settings: binding.settings,
      placement: split
        ? undefined
        : (snapshot.placement ?? (selected ? binding.editor.placement : undefined)),
      crop: selected ? binding.editor.crop : undefined,
    },
    resources,
    signal
  );
  if (result.status === 'hidden') return undefined;
  if (result.status === 'failed') throw new Error('Camera preview unavailable');
  if (result.status !== 'ready') throw new PendingPresentation();
  return result.frame;
}
