import {
  quickEditWebcamFrameAt,
  type QuickEditWebcam,
} from '../../features/video/review/advanced/webcam';

type Frame = NonNullable<ReturnType<typeof quickEditWebcamFrameAt>>;

/** Decoder evidence accompanying the mapped authored webcam frame. */
export type ReviewWebcamAdmission = Frame & {
  representedMediaTime: number;
  generation: number;
  tolerance: number;
  acceptedAt: number;
};

type PlaybackArgs = {
  main: HTMLVideoElement;
  camera: HTMLVideoElement;
  duration: number;
  frameDuration?: number;
  settings(): QuickEditWebcam;
  paint(frame: ReviewWebcamAdmission | null): void;
  failed(): void;
};

/**
 * Reconciles one muted native decoder with the main source clock. Camera events
 * never advance main time. Brief presentation jitter retains the last accepted raster;
 * seeks, visibility boundaries and sustained drift clear it.
 */
export function createReviewWebcamPlayback(args: PlaybackArgs) {
  const playback = new ReviewWebcamPlayback(args);
  playback.start();
  return () => playback.dispose();
}

/** One session owns decoder evidence, alignment policy and transport lifetime. */
class ReviewWebcamPlayback {
  private disposed = false;
  private animation = 0;
  private callback = 0;
  private generation = 0;
  private decoded: number | null = null;
  private seeking = false;
  private requestedTime: number | null = null;
  private alignmentNeeded = true;
  private initialAlignment = true;
  private visible = false;
  private holdingAhead = false;
  private readonly events = new AbortController();
  private readonly raster: ReturnType<typeof createWebcamRaster>;
  private readonly transport: ReturnType<typeof createWebcamTransport>;
  private readonly clock: ReturnType<typeof createSourcePlaybackClock>;
  private readonly frameDuration: number;
  private readonly hasFrameCallback: boolean;
  private previousSourceTime: number;
  private previousOffset: number;
  private previousRate: number;

  constructor(private readonly args: PlaybackArgs) {
    this.raster = createWebcamRaster(args.paint);
    this.transport = createWebcamTransport(args.camera, args.failed);
    this.clock = createSourcePlaybackClock(args.main, this.transport.pause);
    this.frameDuration = args.frameDuration ?? 1 / 30;
    this.hasFrameCallback = typeof args.camera.requestVideoFrameCallback === 'function';
    this.previousSourceTime = args.main.currentTime;
    this.previousOffset = args.settings().offsetSeconds;
    this.previousRate = args.main.playbackRate;
  }

  start() {
    const { main, camera } = this.args;
    const options = { signal: this.events.signal };
    camera.addEventListener('seeked', this.onSeeked, options);
    camera.addEventListener('error', this.onError, options);
    main.addEventListener('pause', this.onPause, options);
    main.addEventListener('seeking', this.onSeeking, options);
    main.addEventListener('ended', this.onPause, options);
    this.requestFrame();
    this.animation = requestAnimationFrame(this.reconcile);
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    cancelAnimationFrame(this.animation);
    if (this.hasFrameCallback) this.args.camera.cancelVideoFrameCallback(this.callback);
    this.events.abort();
    this.clock.dispose();
    this.transport.dispose();
  }
  private requestFrame = () => {
    if (!this.hasFrameCallback || this.disposed) return;
    const expected = this.generation;
    this.callback = this.args.camera.requestVideoFrameCallback((_now, metadata) => {
      if (this.disposed || expected !== this.generation) return;
      this.decoded = metadata.mediaTime;
      this.requestFrame();
    });
  };
  private seek = (time: number) => {
    this.args.camera.playbackRate = this.args.main.playbackRate;
    this.transport.pause();
    this.decoded = null;
    this.generation++;
    if (this.hasFrameCallback) this.args.camera.cancelVideoFrameCallback(this.callback);
    this.seeking = true;
    this.alignmentNeeded = false;
    this.initialAlignment = false;
    this.holdingAhead = false;
    this.requestedTime = time;
    this.args.camera.currentTime = time;
    this.requestFrame();
  };
  private reconcile = () => {
    if (this.disposed) return;
    const now = performance.now();
    const settings = this.args.settings();
    const frame = quickEditWebcamFrameAt(settings, this.args.main.currentTime, this.args.duration);
    const running = this.clock.running(now);
    const tolerance = this.frameDuration * 2;
    this.updateAlignment(frame, settings, tolerance);
    const bridge =
      running && frame && this.raster.canRetain(frame, settings, now, this.args.main.playbackRate);
    if (!running) this.transport.pause();
    if (!frame || this.args.main.seeking) {
      this.transport.pause();
      this.raster.clear();
    } else if (this.args.camera.readyState < 2) {
      if (!bridge) this.raster.clear();
    } else if (!this.seeking && !this.args.camera.seeking && this.alignmentNeeded) {
      this.raster.clear();
      this.seek(frame.time);
    } else {
      const presentationTolerance =
        tolerance * (running ? Math.max(1, this.args.main.playbackRate) : 1);
      const represented = this.hasFrameCallback ? this.decoded : this.args.camera.currentTime;
      const ready =
        !this.alignmentNeeded &&
        !this.seeking &&
        !this.args.camera.seeking &&
        represented !== null &&
        Math.abs(represented - frame.time) <= presentationTolerance;
      if (ready) {
        this.requestedTime = null;
        this.raster.paint(
          {
            ...frame,
            representedMediaTime: represented,
            generation: this.generation,
            tolerance,
            acceptedAt: now,
          },
          settings,
          now
        );
      } else if (!bridge) this.raster.clear();
      this.synchronizeTransport(frame, running, ready, tolerance);
    }
    this.animation = requestAnimationFrame(this.reconcile);
  };
  private onSeeked = () => {
    this.seeking = false;
    if (!this.hasFrameCallback) this.decoded = this.args.camera.currentTime;
  };
  private onPause = () => {
    this.holdingAhead = false;
    this.args.camera.playbackRate = this.args.main.playbackRate;
    this.transport.pause();
  };
  private onSeeking = () => {
    this.initialAlignment = false;
    this.alignmentNeeded = true;
    this.holdingAhead = false;
    this.generation++;
    this.decoded = null;
    if (this.hasFrameCallback) this.args.camera.cancelVideoFrameCallback(this.callback);
    this.requestFrame();
    this.transport.pause();
    this.raster.clear();
  };
  private onError = () => {
    this.transport.pause();
    this.raster.clear();
    this.args.failed();
  };
  private updateAlignment(frame: Frame | null, settings: QuickEditWebcam, tolerance: number) {
    if (
      settings.offsetSeconds !== this.previousOffset ||
      this.args.main.currentTime < this.previousSourceTime ||
      (!!frame && !this.visible)
    ) {
      this.alignmentNeeded = true;
      this.raster.clear();
    }
    if (
      settings.offsetSeconds !== this.previousOffset ||
      this.args.main.currentTime < this.previousSourceTime
    )
      this.initialAlignment = false;
    this.previousOffset = settings.offsetSeconds;
    this.previousSourceTime = this.args.main.currentTime;
    this.visible = !!frame;
    if (this.args.main.playbackRate !== this.previousRate) {
      this.holdingAhead = false;
      this.args.camera.playbackRate = this.args.main.playbackRate;
      this.previousRate = this.args.main.playbackRate;
    }
    if (
      frame &&
      this.args.main.paused &&
      this.requestedTime !== null &&
      Math.abs(this.requestedTime - frame.time) > tolerance
    )
      this.alignmentNeeded = true;
    // Seeking an already decoded initial frame may never produce a second callback.
    // Explicit discontinuities disable this exception before any evidence is consumed.
    if (this.hasAlignedInitialFrame(frame, tolerance)) {
      this.initialAlignment = false;
      this.alignmentNeeded = false;
    }
  }
  private hasAlignedInitialFrame(frame: Frame | null, tolerance: number) {
    return (
      this.initialAlignment &&
      frame &&
      !this.args.main.seeking &&
      !this.seeking &&
      !this.args.camera.seeking &&
      this.args.camera.readyState >= 2 &&
      this.decoded !== null &&
      Math.abs(this.decoded - frame.time) <= tolerance &&
      Math.abs(this.args.camera.currentTime - frame.time) <= tolerance
    );
  }
  private synchronizeTransport(frame: Frame, running: boolean, ready: boolean, tolerance: number) {
    if (!this.seeking && !this.args.camera.seeking && !this.alignmentNeeded) {
      if (running) {
        const drift = frame.time - this.args.camera.currentTime;
        // Ahead decoders wait; hysteresis avoids pause/play chatter at a frame boundary.
        this.holdingAhead = this.holdingAhead ? drift < -tolerance / 2 : drift < -tolerance;
        if (this.holdingAhead) {
          this.args.camera.playbackRate = this.args.main.playbackRate;
          this.transport.pause();
        } else {
          // Recover ordinary lag through transport, never by accepting older pixels.
          const catchUp =
            drift > tolerance ? Math.min(this.args.main.playbackRate * 0.25, drift / 0.25) : 0;
          this.args.camera.playbackRate = Math.min(16, this.args.main.playbackRate + catchUp);
          this.transport.play();
        }
      } else {
        this.holdingAhead = false;
        this.args.camera.playbackRate = this.args.main.playbackRate;
        if (this.args.main.paused && !ready && this.requestedTime !== frame.time)
          this.seek(frame.time);
      }
    }
  }
}

/** Serializes native play promises and makes late resolution harmless after disposal. */
function createWebcamTransport(camera: HTMLVideoElement, failed: () => void) {
  let disposed = false;
  let pendingPlay = false;
  camera.muted = true;
  camera.volume = 0;
  camera.playsInline = true;
  const pause = () => {
    if (!camera.paused) camera.pause();
  };
  const play = () => {
    if (!camera.paused || pendingPlay) return;
    pendingPlay = true;
    void camera
      .play()
      .catch((error: unknown) => {
        if (!disposed && !(error instanceof DOMException && error.name === 'AbortError')) failed();
      })
      .finally(() => {
        pendingPlay = false;
        if (disposed) pause();
      });
  };
  return {
    play,
    pause,
    dispose: () => {
      disposed = true;
      pause();
    },
  };
}

/** Owns the bounded lifetime of the last accepted presentation raster. */
function createWebcamRaster(paint: PlaybackArgs['paint']) {
  let accepted: { at: number; time: number; settings: QuickEditWebcam } | null = null;
  return {
    clear() {
      accepted = null;
      paint(null);
    },
    paint(frame: ReviewWebcamAdmission, settings: QuickEditWebcam, now: number) {
      accepted = { at: now, time: frame.time, settings };
      paint(frame);
    },
    canRetain(frame: Frame, settings: QuickEditWebcam, now: number, rate: number) {
      return (
        accepted?.settings === settings &&
        now - accepted.at <= 250 &&
        frame.time >= accepted.time &&
        frame.time - accepted.time <= 0.25 * Math.max(1, rate)
      );
    },
  };
}

/** Tracks whether the authoritative source clock is actually advancing. */
function createSourcePlaybackClock(main: HTMLVideoElement, pause: () => void) {
  let waiting = false;
  let time = main.currentTime;
  let advanced = performance.now();
  const events = new AbortController();
  main.addEventListener(
    'waiting',
    () => {
      waiting = true;
      pause();
    },
    { signal: events.signal }
  );
  main.addEventListener(
    'playing',
    () => {
      waiting = false;
      advanced = performance.now();
    },
    { signal: events.signal }
  );
  return {
    running(now: number) {
      if (main.currentTime !== time) {
        time = main.currentTime;
        advanced = now;
        waiting = false;
      }
      return !main.paused && !main.ended && !main.seeking && !waiting && now - advanced < 100;
    },
    dispose: () => events.abort(),
  };
}
