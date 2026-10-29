import { prepareReviewCameraPlans } from '../../features/video/review/advanced/camera-plan-preparation';
import { createReviewPreviewRenderer } from '../../workflows/video-review/render-preview';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import {
  quickEditWebcamFrameAt,
  quickEditWebcamScreenPlacementAt,
  type QuickEditWebcamPlacement,
} from '../../features/video/review/advanced/webcam';
import { createReviewPreviewPresentation } from './preview-presentation';
import type { useReviewCutTransitionProvider } from './cut-transition-preview';
import { createReviewWebcamPreviewSource } from './webcam-preview';
import { captureReviewPreviewFrame } from './preview-presentation-frame';
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
class PendingPresentation extends Error {}
type Publication = {
  completed: Awaited<ReturnType<Renderer['render']>>;
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
  private front: Awaited<ReturnType<Renderer['render']>> | null = null;
  private cameraSource: CameraSource | null = null;
  private cameraState: PresentationCameraState = { phase: 'loading', duration: 0, ready: false };
  private readonly publications: number[] = [];
  private readonly video: HTMLVideoElement | null;
  private readonly admission: ReturnType<typeof createPresentationAdmission>;
  private contextLost = false;
  private sourceFrameCallback: number | null = null;
  private renderer: Renderer;
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
    this.admission = createPresentationAdmission(
      () => ({ playing: this.latest().input.playing, video: this.latest().input.video.current }),
      () => this.current,
      () => this.resultTime,
      () => this.front
    );
    this.renderer = this.createRenderer();
    this.scheduler = createReviewPreviewPresentation({
      requestTick: (callback) => requestAnimationFrame(callback),
      cancelTick: (id) => cancelAnimationFrame(id),
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

  private clearFront() {
    this.front?.canvas.parentElement?.replaceChildren();
    this.front?.release();
    this.front = null;
  }

  private status(phase: ReviewPreviewPresentationStatus['phase']) {
    if (this.disposed) return;
    const last = this.publications.at(-1),
      first = this.publications[0];
    this.report({
      phase,
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
      ...(readAsset ? { readAsset } : {}),
      allocation: { describe: graph, replaceLimits: (limits) => resources.replaceLimits(limits) },
      onContextLost: () => {
        if (!this.disposed) {
          this.contextLost = true;
          this.scheduler.invalidate();
          this.status('failed');
        }
      },
    });
  }

  private sampleTime = () => {
    const node = this.latest().input.video.current;
    const time = node && this.latest().input.sourceToResult(node.currentTime);
    if (time === null || time === undefined) throw new PendingPresentation();
    return time;
  };

  private prepare = async (request: { scene: Description; time: number }, signal: AbortSignal) => {
    if (this.contextLost) throw new Error('Preview context lost');
    if (this.latest().input.backgroundPending) throw new PendingPresentation();
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

  private capture = (prepared: Prepared, time: number) => {
    const video = this.video;
    if (!this.current || !video || video.seeking || video.readyState < 2)
      throw new PendingPresentation();
    this.resultTime = time;
    const transition = this.latest().cut.read(time);
    if (transition?.failed) throw new Error('Transition preview unavailable');
    if (transition && (!transition.frames || !transition.lease?.active))
      throw new PendingPresentation();
    const captured = captureReviewPreviewFrame({
      video,
      description: this.current,
      sequence: this.sequence,
      time,
      transition,
      sourceTime: () =>
        this.latest().input.playing ? video.currentTime : this.current!.sourceTime,
      reserveSource: (bytes) => this.admission.reserveSource(bytes, prepared.allocationAssets),
      captureCamera: () =>
        capturePresentationCamera(
          this.latest(),
          video,
          this.cameraState,
          this.cameraSource,
          this.admission.cameraResources
        ),
    });
    if (!captured) {
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
    this.cancelSourceFrameCallback();
    return captured;
  };

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
      this.renderer.render(prepared, frame, signal)
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

  private publishCanvas(host: HTMLDivElement, value: Publication) {
    const canvas = value.completed.canvas;
    const previous = this.front;
    if (canvas.parentElement !== host) {
      canvas.className = 'pointer-events-none absolute inset-0 h-full w-full';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.opacity = '0';
      canvas.style.willChange = 'opacity';
      host.appendChild(canvas);
    }
    canvas.style.opacity = '1';
    canvas.dataset['previewFront'] = 'true';
    if (previous && previous.canvas !== canvas) {
      previous.canvas.style.opacity = '0';
      previous.canvas.dataset['previewFront'] = 'false';
    }
    // Keep one idle publication buffer attached for pool reuse, without DOM replacement per frame.
    for (const child of [...host.children])
      if (child !== canvas && child !== previous?.canvas) child.remove();
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
    this.reportBounds(value.prepared.watermarkBounds);
    this.status('ready');
  };

  private onError = (error: unknown) => {
    this.waiting = error instanceof PendingPresentation;
    if (!this.waiting) {
      this.diagnostics.reportFailure(error);
      this.diagnosed = true;
    }
    this.status(this.waiting ? 'pending' : 'failed');
  };

  readonly ready = () => {
    if (!this.disposed && this.waiting) {
      this.waiting = false;
      this.scheduler.invalidate();
    }
  };

  private seeking = () => {
    this.publications.length = 0;
    this.waiting = true;
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
    this.current = description;
    this.sequence = generation;
    const input = this.latest().input;
    if (this.playing !== input.playing || !active) this.publications.length = 0;
    this.playing = active && input.playing;
    this.scheduler.update({
      scene: description,
      generation: String(generation),
      visible: active,
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
    this.status(active ? 'pending' : 'inactive');
  }

  retry() {
    this.diagnostics = createReviewExportDiagnostics({ destination: 'preview', route: 'render' });
    this.diagnosed = false;
    this.cancelSourceFrameCallback();
    this.waiting = false;
    this.scheduler.invalidate();
    this.renderer.dispose();
    this.renderer = this.createRenderer();
    this.admission.resetAssets();
    this.contextLost = false;
    this.status('pending');
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelSourceFrameCallback();
    this.scheduler.dispose();
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
function capturePresentationCamera(
  snapshot: PresentationSnapshot,
  video: HTMLVideoElement,
  state: PresentationCameraState,
  source: CameraSource | null,
  resources: RenderResources
) {
  const binding = snapshot.input.webcam;
  if (!binding) return undefined;
  if (state.phase === 'failed') throw new Error('Camera preview unavailable');
  if (state.phase !== 'ready' || !source) throw new PendingPresentation();
  const mapped = quickEditWebcamFrameAt(binding.settings, video.currentTime, state.duration);
  if (!mapped) return undefined;
  const screen = quickEditWebcamScreenPlacementAt(binding.settings, video.currentTime);
  const split = screen.width < 1 || screen.height < 1 || !!screen.clip || !!screen.cameraOverlay;
  const selected =
    !binding.disabled && ['webcam', 'webcam-position'].includes(binding.editor.selection.kind);
  const result = source.captureAccepted(
    {
      placement: split
        ? undefined
        : (snapshot.placement ?? (selected ? binding.editor.placement : undefined)),
      crop: selected ? binding.editor.crop : undefined,
    },
    resources
  );
  if (result.status === 'failed') throw new Error('Camera preview unavailable');
  if (result.status !== 'ready') throw new PendingPresentation();
  return result.frame;
}
