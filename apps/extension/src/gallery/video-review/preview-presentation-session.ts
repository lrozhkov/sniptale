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
  type PreviewSourceLease,
} from '../../workflows/video/preview-source';
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
type CameraSource = ReturnType<typeof createReviewWebcamPreviewSource>;
class PendingPresentation extends Error {
  constructor(readonly retryAfterCapture = false) {
    super();
  }
}
type Publication = {
  completed: PresentedFrame;
  prepared: Prepared;
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
  private diagnostics = createReviewExportDiagnostics({ destination: 'preview', route: 'render' });
  private diagnosed = false;
  private disposed = false;
  private waiting = false;
  private playing = false;
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
  private sourceReady = false;
  private sourceUnsupported = false;
  private sourceDiscontinuity = true;
  private clockSample: { sourceTime: number; resultTime: number } | null = null;
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
      (scene) => this.renderer?.maximumInFlight(scene) ?? 1
    );
    this.rendererPreference = this.latest().input.preferences.renderer ?? 'gpu';
    this.renderer = this.createRenderer();
    this.scheduler = createReviewPreviewPresentation({
      ...createReviewPresentationPaintClock(),
      allowPreparedPlayingFrames: true,
      maximumInFlight: (description) =>
        description.renderer === 'legacy' ? 1 : this.renderer.maximumInFlight(description.scene),
      now: () => performance.now(),
      sampleTime: this.sampleTime,
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
      ...(this.front?.renderer ? { renderer: this.front.renderer } : {}),
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

  private createRenderer() {
    const { resources, graph } = this.admission;
    const readAsset = this.latest().input.readAsset;
    return createReviewPreviewRenderer({
      resources,
      renderer: this.rendererPreference,
      maximumInFlight: this.rendererPreference === 'gpu' ? 2 : 1,
      annotationExecutor: () =>
        createEffectRuntimeSandboxExecutor(
          this.rendererPreference === 'gpu' ? { compositionBackend: 'gpu-scene' } : {}
        ),
      ...(this.rendererPreference === 'gpu'
        ? {
            annotationWarmExecutor: () =>
              this.playing
                ? createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene-plan' })
                : undefined,
          }
        : {}),
      ...(readAsset ? { readAsset } : {}),
      allocation: { describe: graph, replaceLimits: (limits) => resources.replaceLimits(limits) },
      onContextLost: () => {
        if (!this.disposed) {
          this.contextLost = true;
          this.reportClock(false);
          this.scheduler.invalidate();
          this.status('failed');
        }
      },
    });
  }

  private sampleTime = () => {
    const node = this.latest().input.video.current;
    const sourceTime = node?.currentTime;
    const time = sourceTime === undefined ? null : this.latest().input.sourceToResult(sourceTime);
    if (time === null || sourceTime === undefined) throw new PendingPresentation();
    this.clockSample = { sourceTime, resultTime: time };
    return time;
  };

  private prepare = async (request: { scene: Description; time: number }, signal: AbortSignal) => {
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
    this.resultTime =
      this.latest().input.playing && this.video
        ? (this.latest().input.sourceToResult(this.video.currentTime) ?? request.time)
        : request.time;
    if (!this.video || this.video.seeking || this.video.readyState < 2)
      throw new PendingPresentation();
    if (this.canDecodeSource() && !this.sourceReady && !this.sourceUnsupported)
      await this.prepareSource(
        this.latest().input.playing ? this.video.currentTime : request.scene.sourceTime,
        signal
      );
    signal.throwIfAborted();
    const transition = this.latest().cut.read(this.resultTime);
    if (transition?.failed) throw new Error('Transition preview unavailable');
    if (transition && (!transition.frames || !transition.lease?.active))
      throw new PendingPresentation();
    const current = this.current;
    const prepared = await reviewExportPhase(signal, 'prepare', () =>
      this.renderer.prepare(
        current.scene.captions && current.scene.webcam
          ? {
              ...current.scene,
              webcamDuration:
                this.cameraState.phase === 'ready' ? this.cameraState.duration : undefined,
            }
          : current.scene,
        current.dimensions,
        signal
      )
    );
    this.admission.replaceAssets(prepared.allocationAssets);
    return { value: prepared, release: () => prepared.release() };
  };

  private capture = (prepared: Prepared, time: number, signal: AbortSignal) => {
    const video = this.video;
    if (!this.current || !video || video.seeking || video.readyState < 2)
      throw new PendingPresentation();
    this.resultTime = time;
    const transition = this.latest().cut.read(time);
    if (transition?.failed) throw new Error('Transition preview unavailable');
    if (transition && (!transition.frames || !transition.lease?.active))
      throw new PendingPresentation();
    const sourceTime = this.latest().input.playing
      ? this.clockSample?.resultTime === time
        ? this.clockSample.sourceTime
        : video.currentTime
      : this.current.sourceTime;
    const snapshot = this.latest();
    const cameraSource = this.cameraSource;
    const cameraState = this.cameraState;
    const args = {
      video,
      description: this.current,
      sequence: this.sequence,
      time,
      transition,
      sourceTime: () => sourceTime,
      reserveSource: (bytes: number) =>
        this.admission.reserveSource(bytes, prepared.allocationAssets),
      captureCamera: () => undefined,
    };
    // Compatibility pixels freeze before camera acquisition can yield to another HTML tick.
    const primary =
      this.sourceReady && this.canDecodeSource() ? undefined : captureReviewPreviewFrame(args);
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
  };

  private canDecodeSource() {
    return typeof VideoDecoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  }

  private resetSource() {
    this.sourceProvider?.dispose();
    this.sourceProvider = null;
    this.sourceReady = this.sourceUnsupported = false;
    this.sourceDiscontinuity = true;
    this.clockSample = null;
  }

  private sourceDemand(time: number): PreviewSourceDemand {
    const duration = this.video?.duration;
    return {
      id: 'source',
      url: this.sourceIdentity,
      time,
      rangeStart: 0,
      ...(duration !== undefined && Number.isFinite(duration) && duration > 0
        ? { rangeEnd: duration, holdEnd: true }
        : {}),
    };
  }

  private async prepareSource(time: number, signal: AbortSignal) {
    const provider = (this.sourceProvider ??= createPreviewSourceProvider());
    const lease = await provider.acquire([this.sourceDemand(time)], signal, {
      discontinuity: true,
    });
    try {
      signal.throwIfAborted();
      if (this.disposed || this.sourceProvider !== provider) throw new PendingPresentation();
      this.sourceReady = lease !== null;
      this.sourceUnsupported = lease === null;
    } finally {
      lease?.release();
    }
  }

  private async captureDecoded(
    args: Parameters<typeof captureReviewPreviewFrame>[0],
    sourceTime: number,
    signal: AbortSignal
  ) {
    const provider = this.sourceProvider;
    if (!provider) throw new PendingPresentation();
    signal.throwIfAborted();
    let lease: PreviewSourceLease | null = null;
    const discontinuity = this.sourceDiscontinuity || !this.latest().input.playing;
    this.sourceDiscontinuity = false;
    try {
      lease = await provider.acquire([this.sourceDemand(sourceTime)], signal, { discontinuity });
      signal.throwIfAborted();
      if (this.disposed || this.sourceProvider !== provider) throw new PendingPresentation();
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
      lease?.release();
    }
  }

  private cancelSourceFrameCallback() {
    if (this.sourceFrameCallback === null) return;
    this.video?.cancelVideoFrameCallback(this.sourceFrameCallback);
    this.sourceFrameCallback = null;
  }

  private render = async (
    prepared: Prepared,
    frame: RenderFrame,
    _request: unknown,
    signal: AbortSignal
  ) => {
    const completed = await reviewExportPhase(signal, 'compose', () =>
      this.renderer.renderPresentation(prepared, frame, signal, (size, backend) => {
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
    );
    let transferred = false;
    return {
      value: {
        completed,
        prepared,
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
    // Two GPU requests and the retained front rotate through three publication buffers.
    const maximumHidden = this.rendererPreference === 'gpu' ? 2 : 1;
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
      this.diagnostics.reportFailure(error);
      this.diagnosed = true;
    }
    this.status(this.waiting ? 'pending' : 'failed');
    if (error instanceof PendingPresentation && error.retryAfterCapture) this.ready();
  };

  readonly ready = () => {
    if (!this.disposed && this.waiting) {
      this.waiting = false;
      this.reportClock(this.playing && !this.contextLost);
      this.scheduler.invalidate();
    }
  };

  private seeking = () => {
    this.sourceDiscontinuity = true;
    this.renderer.cancelWarmAnnotations?.();
    this.publications.length = 0;
    this.waiting = true;
    this.reportClock(false);
    this.scheduler.invalidate();
    this.status('pending');
  };

  private connectSources() {
    for (const event of ['loadeddata', 'seeked', 'timeupdate'])
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

  update(description: Description, generation: number, interacting: boolean, active = true) {
    if (
      this.current !== description ||
      this.sequence !== generation ||
      !active ||
      !this.latest().input.playing
    )
      this.renderer.cancelWarmAnnotations?.();
    this.current = description;
    this.sequence = generation;
    const input = this.latest().input;
    const deferFrames = !input.playing && !!input.deferFrames;
    if (this.playing !== input.playing || !active) this.publications.length = 0;
    this.playing = active && input.playing;
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
    for (const event of ['loadeddata', 'seeked', 'timeupdate'])
      this.video?.removeEventListener(event, this.ready);
    this.video?.removeEventListener('seeking', this.seeking);
    this.cameraSource?.dispose();
    this.clearFront();
    this.renderer.dispose();
    this.admission.resources.dispose();
  }
}

/** Camera readiness is independent of the atomic source-frame lease and native transport. */
async function capturePresentationCamera(
  snapshot: PresentationSnapshot,
  sourceTime: number,
  state: PresentationCameraState,
  source: CameraSource | null,
  resources: RenderResources,
  signal: AbortSignal
) {
  const binding = snapshot.input.webcam;
  if (!binding) return undefined;
  if (state.phase === 'failed') throw new Error('Camera preview unavailable');
  if (state.phase !== 'ready' || !source) throw new PendingPresentation();
  const mapped = quickEditWebcamFrameAt(binding.settings, sourceTime, state.duration);
  if (!mapped) return undefined;
  const screen = quickEditWebcamScreenPlacementAt(binding.settings, sourceTime);
  const split = screen.width < 1 || screen.height < 1 || !!screen.clip || !!screen.cameraOverlay;
  const selected =
    !binding.disabled && ['webcam', 'webcam-position'].includes(binding.editor.selection.kind);
  const result = await source.captureFrame(
    {
      sourceTime,
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
