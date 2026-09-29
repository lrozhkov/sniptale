import { translate } from '../../../platform/i18n';
import type { VideoFrameSnapshot } from './video-frame-cache';

/** Displays only the frame and timestamp returned for the current sampled position. */
export function VideoThumbnail({ snapshot }: { snapshot: VideoFrameSnapshot }) {
  const ready = snapshot.status === 'ready' && Boolean(snapshot.dataUrl);
  return (
    <div
      data-ui="gallery.preview.player.frame"
      data-sample-time={snapshot.sampleTime}
      className="pointer-events-none w-full overflow-hidden rounded-[var(--sniptale-radius-md)]
        border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
        p-1.5 text-center text-xs text-[var(--sniptale-color-text-primary)] shadow-lg"
    >
      <div
        className="grid aspect-video w-full place-items-center overflow-hidden rounded-sm
        bg-[var(--sniptale-color-surface-canvas)]"
      >
        {ready ? (
          <img src={snapshot.dataUrl} alt="" aria-hidden className="h-full w-full object-contain" />
        ) : (
          <span role="status" className="px-2 text-[var(--sniptale-color-text-secondary)]">
            {translate(
              snapshot.status === 'error'
                ? 'gallery.preview.player.frameFailed'
                : 'gallery.preview.player.frameLoading'
            )}
          </span>
        )}
      </div>
      <div className="pt-1 font-medium tabular-nums">{videoTime(snapshot.sampleTime)}</div>
    </div>
  );
}

/** Stable clock notation for media positions, including recordings longer than an hour. */
export function videoTime(value: number) {
  const seconds = Math.floor(Number.isFinite(value) ? Math.max(0, value) : 0);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
