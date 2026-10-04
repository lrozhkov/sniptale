import { Play } from 'lucide-react';
import { useVideoViewport } from './video-viewport';
import { usePlaybackSpaceShortcut } from './shortcuts';
import { useEffect, type KeyboardEvent } from 'react';
import { translate, useAppLocale } from '../../platform/i18n';
import { VideoControls } from './video-controls';
import { useVideoPlayer } from './video-playback';
import { useVideoControlsVisibility } from './video-controls-visibility';
import './video-player.css';

interface PreviewVideoProps {
  src: string;
  spacePlayback?: 'enabled' | 'blocked' | undefined;
  trashMode?: boolean;
  prepare?: boolean;
  onReady?: (() => void) | undefined;
  onMediaError?: (() => void) | undefined;
  onDuration?: ((duration: number) => void) | undefined;
}

/** Each source has one disposable playback and viewport lifetime. */
export function PreviewVideo(props: PreviewVideoProps) {
  return <PreviewVideoSource key={props.src} {...props} />;
}

function PreviewVideoSource({
  src,
  trashMode = false,
  prepare = false,
  onReady,
  onMediaError,
  onDuration,
  spacePlayback,
}: PreviewVideoProps) {
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
  const { video, container, duration, pending, buffering, error, toggleFullscreen } = player;
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
  useEffect(() => {
    if (!prepare && duration > 0) onDuration?.(duration);
  }, [duration, onDuration, prepare]);
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
      <VideoViewport
        src={src}
        player={player}
        prepare={prepare}
        trashMode={trashMode}
        spacePlayback={spacePlayback}
        onReady={onReady}
        onMediaError={onMediaError}
      />
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

/** Media geometry and gestures share the viewport; playback commands stay with the source owner. */
function VideoViewport({
  src,
  player,
  prepare,
  trashMode,
  spacePlayback,
  onReady,
  onMediaError,
}: Pick<PreviewVideoProps, 'src' | 'spacePlayback' | 'onReady' | 'onMediaError'> & {
  player: ReturnType<typeof useVideoPlayer>;
  prepare: boolean;
  trashMode: boolean;
}) {
  const { video, fit, mediaEvents, pending } = player;
  const viewport = useVideoViewport({
    src,
    fit: player.fit,
    disabled: prepare || spacePlayback === 'blocked' || !player.ready || player.pending,
    togglePlayback: player.togglePlayback,
  });
  return (
    <div
      data-ui="gallery.preview.player.viewport"
      {...viewport.events}
      className="relative grid min-h-0 flex-1 overflow-auto"
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
      {fit && player.ready && !player.playing && !viewport.navigated && !prepare ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <button
            type="button"
            data-ui="gallery.preview.player.centralPlay"
            aria-label={translate('gallery.preview.player.playVideo')}
            disabled={pending || spacePlayback === 'blocked'}
            className="pointer-events-auto grid h-16 w-16 place-items-center rounded-full
                border border-white/40 bg-black/65 text-white shadow-lg
                hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-4
                focus-visible:outline-[var(--sniptale-color-accent)] disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation();
              void player.togglePlayback();
            }}
          >
            <Play size={28} aria-hidden="true" className="ml-1" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function handleVideoScrollKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key.startsWith('Arrow')) event.stopPropagation();
}
