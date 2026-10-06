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
 * never advance main time; late decoded frames remain invisible until they match.
 */
export function createReviewWebcamPlayback(args: PlaybackArgs) {
  const { main, camera } = args;
  let disposed = false;
  let animation = 0;
  let callback = 0;
  let generation = 0;
  let decoded: number | null = null;
  const frameDuration = args.frameDuration ?? 1 / 30;
  let seeking = false;
  let requestedTime: number | null = null;
  let seekStarted = 0;
  let seekLatency = 0;
  let waiting = false;
  let lastMainTime = main.currentTime;
  let lastMainAdvance = performance.now();
  const hasFrameCallback = typeof camera.requestVideoFrameCallback === 'function';
  const transport = createWebcamTransport(camera, args.failed);
  const { play, pause } = transport;
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
    if (main.currentTime !== lastMainTime) {
      lastMainTime = main.currentTime;
      lastMainAdvance = now;
    }
    const frame = quickEditWebcamFrameAt(args.settings(), main.currentTime, camera.duration);
    const running =
      !main.paused && !main.ended && !main.seeking && !waiting && now - lastMainAdvance < 100;
    if (!running) pause();
    if (!frame || camera.readyState < 2 || main.seeking) {
      pause();
      args.paint(null);
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
        args.paint(frame);
        if (running) play();
      } else {
        args.paint(null);
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
    if (seeking) seekLatency = Math.min(0.1, Math.max(0, performance.now() - seekStarted) / 1000);
    seeking = false;
    if (!hasFrameCallback) decoded = camera.currentTime;
  };
  const onWaiting = () => {
    waiting = true;
    pause();
  };
  const onPlaying = () => {
    waiting = false;
    lastMainAdvance = performance.now();
  };
  const onPause = () => pause();
  const onError = () => {
    pause();
    args.paint(null);
    args.failed();
  };
  camera.addEventListener('seeked', onSeeked);
  camera.addEventListener('error', onError);
  main.addEventListener('waiting', onWaiting);
  main.addEventListener('playing', onPlaying);
  main.addEventListener('pause', onPause);
  main.addEventListener('seeking', onPause);
  main.addEventListener('ended', onPause);
  requestFrame();
  animation = requestAnimationFrame(reconcile);
  return () => {
    disposed = true;
    generation++;
    cancelAnimationFrame(animation);
    if (hasFrameCallback) camera.cancelVideoFrameCallback(callback);
    camera.removeEventListener('seeked', onSeeked);
    camera.removeEventListener('error', onError);
    main.removeEventListener('waiting', onWaiting);
    main.removeEventListener('playing', onPlaying);
    main.removeEventListener('pause', onPause);
    main.removeEventListener('seeking', onPause);
    main.removeEventListener('ended', onPause);
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
