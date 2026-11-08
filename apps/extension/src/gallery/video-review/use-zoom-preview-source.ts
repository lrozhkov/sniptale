import { VideoSample } from 'mediabunny';
import {
  createPreviewSourceProvider,
  type PreviewSourceProvider,
  type PreviewSourceBinding,
} from '../../workflows/video/preview-source';
import {
  prepareDecodedVideoFrame,
  prepareDecodedVideoSample,
} from '../../features/video/composition/draw/decoded-sample';
import { useEffect, useState } from 'react';

/** One materialized source frame, independent of the main playback element. */
export interface ZoomPreviewFrame {
  image: CanvasImageSource;
  width: number;
  height: number;
  /** Scalar provenance survives the owned RGB copy; the decoded source lease does not escape. */
  readonly selection?: Pick<
    PreviewSourceBinding,
    'url' | 'target' | 'timestamp' | 'nextTimestamp' | 'sampleTime' | 'heldAtEnd'
  >;
}

export type ZoomPreviewFrameLoader = (
  sourceTime: number,
  signal: AbortSignal
) => Promise<ZoomPreviewFrame>;

/** A bounded, cancellable media wait; already decoded frames do not require another seek. */
function waitForVideo(
  video: HTMLVideoElement,
  event: 'loadeddata' | 'seeked',
  ready: () => boolean,
  signal: AbortSignal,
  start?: () => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener('error', fail);
      signal.removeEventListener('abort', abort);
    };
    const done = () => {
      if (!ready()) return;
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error('Preview frame is unavailable.'));
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(fail, 10_000);
    video.addEventListener(event, done);
    video.addEventListener('error', fail);
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      if (video.error) {
        fail();
        return;
      }
      start?.();
      done();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

/** Owns a muted decoder and serialized frame acquisition, including abort and URL cleanup. */
export function useZoomPreviewSource(file: File | null): ZoomPreviewFrameLoader | null {
  const [source, setSource] = useState<{ file: File; load: ZoomPreviewFrameLoader } | null>(null);
  useEffect(() => {
    if (!file) return;
    const owner = new AbortController();
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = url;
    let queue: Promise<unknown> = Promise.resolve();
    let provider: PreviewSourceProvider | null = null;
    const load: ZoomPreviewFrameLoader = (sourceTime, requestedSignal) => {
      const signal = AbortSignal.any([owner.signal, requestedSignal]);
      const task = queue.then(async () => {
        signal.throwIfAborted();
        if (typeof VideoDecoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
          provider ??= createPreviewSourceProvider();
          provider.retainSources(new Set([url]));
          const lease = await provider.acquire(
            [{ id: 'zoom-preview', url, time: sourceTime, holdSourceEnd: true }],
            signal,
            { discontinuity: true }
          );
          if (lease) {
            let sample: VideoSample | undefined;
            try {
              signal.throwIfAborted();
              const binding = lease.bindings.get('zoom-preview');
              if (!binding?.source.toVideoFrame)
                throw new Error('Preview source binding is unavailable.');
              sample = await prepareDecodedVideoSample(
                new VideoSample(binding.source.toVideoFrame(), binding.source.orientation),
                signal
              );
              signal.throwIfAborted();
              const canvas = document.createElement('canvas');
              canvas.width = binding.source.sourceWidth;
              canvas.height = binding.source.sourceHeight;
              const context = canvas.getContext('2d');
              if (!context) throw new Error('Preview canvas is unavailable.');
              sample.draw(context, 0, 0, canvas.width, canvas.height);
              signal.throwIfAborted();
              return {
                image: canvas,
                width: canvas.width,
                height: canvas.height,
                selection: Object.freeze({
                  url: binding.url,
                  target: binding.target,
                  timestamp: binding.timestamp,
                  nextTimestamp: binding.nextTimestamp,
                  ...(binding.sampleTime === undefined ? {} : { sampleTime: binding.sampleTime }),
                  ...(binding.heldAtEnd === undefined ? {} : { heldAtEnd: binding.heldAtEnd }),
                }),
              };
            } finally {
              sample?.close();
              lease.release();
            }
          }
        }
        await waitForVideo(video, 'loadeddata', () => video.readyState >= 2, signal);
        const time = Math.max(0, Math.min(sourceTime, Math.max(0, video.duration - 0.001)));
        if (video.seeking || Math.abs(video.currentTime - time) > 0.0001)
          await waitForVideo(
            video,
            'seeked',
            () => !video.seeking && video.readyState >= 2,
            signal,
            () => {
              video.currentTime = time;
            }
          );
        signal.throwIfAborted();
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, video.videoWidth);
        canvas.height = Math.max(1, video.videoHeight);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Preview canvas is unavailable.');
        const frame = await prepareDecodedVideoFrame(new VideoFrame(video), signal);
        try {
          signal.throwIfAborted();
          context.drawImage(frame, 0, 0);
        } finally {
          frame.close();
        }
        return { image: canvas, width: canvas.width, height: canvas.height };
      });
      queue = task.catch(() => undefined);
      return task;
    };
    setSource({ file, load });
    return () => {
      owner.abort();
      provider?.dispose();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };
  }, [file]);
  return source?.file === file ? source.load : null;
}

/** Owns the selected frame request and rejects obsolete responses after selection changes. */
export function useZoomPreviewFrame(load: ZoomPreviewFrameLoader | null, time: number | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    load: ZoomPreviewFrameLoader;
    time: number;
    frame: ZoomPreviewFrame | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    if (load && time !== null)
      void load(time, controller.signal).then(
        (frame) => {
          if (!controller.signal.aborted) setResult({ load, time, frame, failed: false });
        },
        () => {
          if (!controller.signal.aborted) setResult({ load, time, frame: null, failed: true });
        }
      );
    return () => controller.abort();
  }, [load, time, attempt]);
  const current = result?.load === load && result?.time === time ? result : null;
  const status =
    !load || time === null
      ? 'unavailable'
      : current?.failed
        ? 'failed'
        : current?.frame
          ? 'ready'
          : 'loading';
  return { frame: current?.frame ?? null, status, retry: () => setAttempt((value) => value + 1) };
}
