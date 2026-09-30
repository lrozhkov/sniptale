import { usePlaybackSpaceShortcut } from './shortcuts';
import { useEffect, type KeyboardEvent } from 'react';
import { translate, useAppLocale } from '../../platform/i18n';
import { VideoControls } from './video-controls';
import { useVideoPlayer } from './video-playback';
import { useVideoControlsVisibility } from './video-controls-visibility';
import './video-player.css';

/** Gallery controls remain inside their fullscreen and locale owner. */
export function PreviewVideo({
  src,
  trashMode = false,
  prepare = false,
  onReady,
  onMediaError,
  spacePlayback,
}: {
  src: string;
  spacePlayback?: 'enabled' | 'blocked';
  trashMode?: boolean;
  prepare?: boolean;
  onReady?: (() => void) | undefined;
  onMediaError?: (() => void) | undefined;
}) {
  useAppLocale();
  const player = useVideoPlayer();
  const ownsSpace = spacePlayback !== undefined && !prepare;
  usePlaybackSpaceShortcut(
    () => {
      if (spacePlayback === 'enabled') void player.togglePlayback();
    },
    ownsSpace,
    'all-targets'
  );
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
  const visibility = useVideoControlsVisibility({
    container,
    src,
    fullscreen: player.fullscreen,
    canHide: player.playing && !pending && !buffering && !error,
  });
  useEffect(() => {
    const element = video.current;
    if (element && element.getAttribute('src') !== src) {
      element.setAttribute('src', src);
      element.load();
    }
    return () => {
      if (!element) return;
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [src, video]);
  return (
    <div
      ref={container}
      data-ui="gallery.preview.player"
      data-fullscreen={player.fullscreen}
      className="@container/player relative flex h-full w-full min-h-0 min-w-0 flex-col
        bg-[var(--sniptale-color-surface-canvas)] text-[var(--sniptale-color-text-primary)]"
      aria-busy={pending || buffering}
      onKeyDown={(event) => {
        if (
          !event.defaultPrevented &&
          event.key === 'Escape' &&
          document.fullscreenElement === container.current
        ) {
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
            preload={prepare ? 'auto' : 'metadata'}
            playsInline
            controlsList={trashMode ? 'nodownload' : undefined}
            onContextMenu={trashMode ? (event) => event.preventDefault() : undefined}
            className={
              fit
                ? 'block h-full w-full bg-transparent object-contain'
                : 'block max-h-none max-w-none bg-transparent'
            }
            {...mediaEvents}
            onLoadedData={(event) => {
              mediaEvents.onLoadedData?.(event);
              onReady?.();
            }}
            onError={(event) => {
              mediaEvents.onError?.(event);
              onMediaError?.();
            }}
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
      <VideoControls src={src} player={player} visibility={visibility} spaceShortcut={ownsSpace} />
    </div>
  );
}

function handleVideoScrollKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key.startsWith('Arrow')) event.stopPropagation();
}
