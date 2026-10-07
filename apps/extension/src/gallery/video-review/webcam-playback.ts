import {
  quickEditWebcamFrameAt,
  type QuickEditWebcam,
} from '../../features/video/review/advanced/webcam';

type Frame = NonNullable<ReturnType<typeof quickEditWebcamFrameAt>>;

type PlaybackArgs = {
  main: HTMLVideoElement;
  camera: HTMLVideoElement;
  frameDuration?: number;
  settings(): QuickEditWebcam;
  paint(frame: Frame | null): void;
  failed(): void;
};

/**
 * Reconciles one muted native decoder with the main source clock. Camera events
 * never advance main time. Brief presentation jitter retains the last accepted raster;
 * seeks, visibility boundaries and sustained drift clear it.
 */
export function createReviewWebcamPlayback(args: PlaybackArgs) {
  const { main, camera } = args;
  let disposed = false;
  let animation = 0;
  let callback = 0;
  let generation = 0;
  let decoded: number | null = null;
  const raster = createWebcamRaster(args.paint);
  const clear = raster.clear;
  const frameDuration = args.frameDuration ?? 1 / 30;
  let seeking = false;
  let requestedTime: number | null = null;
  let seekStarted = 0;
  let seekLatency = 0;
  const hasFrameCallback = typeof camera.requestVideoFrameCallback === 'function';
  const transport = createWebcamTransport(camera, args.failed);
  const { play, pause } = transport;
  const clock = createSourcePlaybackClock(main, pause);
  const requestFrame = () => {
    if (!hasFrameCallback || disposed) return;
    const expected = generation;
    callback = camera.requestVideoFrameCallback((_now, metadata) => {
      if (disposed || expected !== generation) return;
      decoded = metadata.mediaTime;
      requestFrame();
    });
  };
  const seek = (time: number) => {
    pause();
    decoded = null;
    generation++;
    if (hasFrameCallback) camera.cancelVideoFrameCallback(callback);
    seeking = true;
    seekStarted = performance.now();
    requestedTime = time;
    camera.currentTime = time;
    requestFrame();
  };
  const reconcile = () => {
    if (disposed) return;
    const now = performance.now();
    const settings = args.settings();
    const frame = quickEditWebcamFrameAt(settings, main.currentTime, camera.duration);
    const running = clock.running(now);
    const bridge = running && frame && raster.canRetain(frame, settings, now, main.playbackRate);
    if (!running) pause();
    if (!frame || main.seeking) {
      pause();
      clear();
    } else if (camera.readyState < 2) {
      pause();
      if (!bridge) clear();
    } else {
      camera.playbackRate = main.playbackRate;
      const tolerance = frameDuration * 2;
      // Accelerated playback can skip source frames between presentation ticks.
      // Keep clock drift strict; bound visible frame age in playback wall time.
      const presentationTolerance = tolerance * (running ? Math.max(1, main.playbackRate) : 1);
      const represented = hasFrameCallback ? decoded : camera.currentTime;
      const ready =
        !seeking &&
        !camera.seeking &&
        represented !== null &&
        Math.abs(represented - frame.time) <= presentationTolerance;
      if (ready) {
        requestedTime = null;
        raster.paint(frame, settings, now);
        if (running) play();
      } else {
        if (!bridge) clear();
        if (
          running &&
          !seeking &&
          !camera.seeking &&
          Math.abs(camera.currentTime - frame.time) <= tolerance
        ) {
          // A delayed presentation callback is not decoder drift. Seeking here
          // pauses an aligned decoder and can repeatedly restart it at high rates.
          play();
        } else if (
          !seeking &&
          !camera.seeking &&
          (requestedTime === null || Math.abs(requestedTime - frame.time) > tolerance)
        )
          seek(
            running
              ? Math.min(
                  camera.duration - Math.min(frameDuration, camera.duration),
                  frame.time + seekLatency * main.playbackRate
                )
              : frame.time
          );
      }
    }
    animation = requestAnimationFrame(reconcile);
  };
  const onSeeked = () => {
    if (seeking) seekLatency = Math.min(1, Math.max(0, performance.now() - seekStarted) / 1000);
    seeking = false;
    if (!hasFrameCallback) decoded = camera.currentTime;
  };
  const onPause = () => pause();
  const onSeeking = () => {
    pause();
    clear();
  };
  const onError = () => {
    pause();
    clear();
    args.failed();
  };
  const events = new AbortController();
  camera.addEventListener('seeked', onSeeked, { signal: events.signal });
  camera.addEventListener('error', onError, { signal: events.signal });
  main.addEventListener('pause', onPause, { signal: events.signal });
  main.addEventListener('seeking', onSeeking, { signal: events.signal });
  main.addEventListener('ended', onPause, { signal: events.signal });
  requestFrame();
  animation = requestAnimationFrame(reconcile);
  return () => {
    disposed = true;
    generation++;
    cancelAnimationFrame(animation);
    if (hasFrameCallback) camera.cancelVideoFrameCallback(callback);
    events.abort();
    clock.dispose();
    transport.dispose();
  };
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
    paint(frame: Frame, settings: QuickEditWebcam, now: number) {
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
