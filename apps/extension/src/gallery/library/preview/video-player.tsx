import type { KeyboardEvent } from 'react';
import { translate, useAppLocale } from '../../../platform/i18n';
import { VideoControls } from './video-controls';
import { useVideoPlayer } from './video-playback';

/** Gallery controls remain inside their fullscreen and locale owner. */
export function PreviewVideo({ src, trashMode = false }: { src: string; trashMode?: boolean }) {
  useAppLocale();
  const player = useVideoPlayer();
  const {
    video,
    mediaEvents,
    container,
    duration,
    fit,
    pending,
    buffering,
    error,
    toggleFullscreen,
  } = player;
  return (
    <div
      ref={container}
      data-ui="gallery.preview.player"
      className="relative flex h-full w-full min-h-0 min-w-0 flex-col
        bg-[var(--sniptale-color-surface-canvas)] text-[var(--sniptale-color-text-primary)]"
      aria-busy={pending || buffering}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && document.fullscreenElement === container.current) {
          event.preventDefault();
          event.stopPropagation();
          void toggleFullscreen();
        }
      }}
    >
      <div
        className="grid min-h-0 flex-1 overflow-auto"
        tabIndex={fit ? -1 : 0}
        onKeyDown={handleVideoScrollKey}
      >
        <div
          className={
            fit
              ? 'flex min-h-0 items-center justify-center'
              : 'grid h-max min-h-full w-max min-w-full place-items-center'
          }
        >
          <video
            ref={video}
            src={src}
            preload="metadata"
            playsInline
            controlsList={trashMode ? 'nodownload' : undefined}
            onContextMenu={trashMode ? (event) => event.preventDefault() : undefined}
            className={
              fit
                ? 'block h-full w-full bg-black object-contain'
                : 'block max-h-none max-w-none bg-black'
            }
            {...mediaEvents}
          />
        </div>
      </div>
      {!duration && !error ? (
        <div role="status" className="absolute inset-x-0 top-1/2 text-center text-xs">
          {translate('gallery.preview.videoLoading')}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="px-3 py-1 text-xs">
          {translate(
            error === 'media'
              ? 'gallery.preview.player.failed'
              : 'gallery.preview.player.actionFailed'
          )}
        </div>
      ) : null}
      <VideoControls src={src} player={player} />
    </div>
  );
}

function handleVideoScrollKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key.startsWith('Arrow')) event.stopPropagation();
}
