import { useEffect, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';

/** A disposable, debounced decoder; it never changes the playback element or retains frames. */
export function VideoThumbnail({ src, time }: { src: string; time: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<{ time: number; src: string; failed: boolean } | null>(null);
  useEffect(() => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    let disposed = false;
    let target = time;
    const fail = () => {
      if (!disposed) setResult({ time, src, failed: true });
    };
    const draw = () => {
      if (disposed || video.seeking || video.readyState < 2) return;
      const surface = canvas.current;
      if (!surface || !video.videoWidth || !video.videoHeight) return;
      try {
        surface.width = 192;
        surface.height = Math.max(1, Math.round((192 * video.videoHeight) / video.videoWidth));
        surface.height = Math.min(144, surface.height);
        const context = surface.getContext('2d');
        if (!context) {
          fail();
          return;
        }
        const scale = Math.min(
          surface.width / video.videoWidth,
          surface.height / video.videoHeight
        );
        const width = video.videoWidth * scale;
        const height = video.videoHeight * scale;
        context.clearRect(0, 0, surface.width, surface.height);
        context.drawImage(
          video,
          (surface.width - width) / 2,
          (surface.height - height) / 2,
          width,
          height
        );
        clearTimeout(timeout);
        setResult({ time, src, failed: false });
      } catch {
        fail();
      }
    };
    const seek = () => {
      target = Number.isFinite(video.duration)
        ? Math.min(time, Math.max(0, video.duration - 0.001))
        : time;
      try {
        if (Math.abs(video.currentTime - target) < 0.001) draw();
        else video.currentTime = target;
      } catch {
        fail();
      }
    };
    video.addEventListener('loadeddata', seek);
    video.addEventListener('seeked', draw);
    video.addEventListener('error', fail);
    const timeout = setTimeout(fail, 8000);
    const debounce = setTimeout(() => {
      video.src = src;
    }, 120);
    return () => {
      disposed = true;
      clearTimeout(debounce);
      clearTimeout(timeout);
      video.removeEventListener('loadeddata', seek);
      video.removeEventListener('seeked', draw);
      video.removeEventListener('error', fail);
      video.removeAttribute('src');
      video.load();
    };
  }, [src, time]);
  const current = result?.src === src && result.time === time ? result : null;
  return (
    <div
      className="pointer-events-none mx-auto w-48 max-w-full rounded-[var(--sniptale-radius-md)]
        bg-[var(--sniptale-color-surface-panel)] p-2 text-center text-xs shadow-sm"
    >
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="max-h-36 w-full object-contain"
        hidden={!current || current.failed}
      />
      {!current || current.failed ? (
        <span>
          {translate(
            current?.failed
              ? 'gallery.preview.player.frameFailed'
              : 'gallery.preview.player.frameLoading'
          )}
        </span>
      ) : null}
      <div>{videoTime(time)}</div>
    </div>
  );
}

/** Stable clock notation for media positions, including recordings longer than an hour. */
export function videoTime(value: number) {
  const seconds = Math.floor(Number.isFinite(value) ? Math.max(0, value) : 0);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
