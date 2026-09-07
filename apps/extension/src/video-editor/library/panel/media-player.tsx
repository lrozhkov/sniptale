import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2, Pause, Play, Search, Volume2, VolumeX } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductRange } from '@sniptale/ui/product-form-controls';
import { translate } from '../../../platform/i18n';
import { usePlaybackSpaceShortcut } from '../../runtime/session/playback/shortcuts';
import { formatDuration } from '../../chrome/display';

/** Disposable library playback owns its media element; it never edits project timing. */
export function LibraryMediaPlayer(props: {
  src: string | null;
  filename: string;
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const previousZoom = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const playback = useLibraryPlayback(props.src);
  const { video, ready, sync, failed, setFailed } = playback;
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (node) {
      const ratio = zoom / previousZoom.current;
      node.scrollLeft = (node.scrollLeft + node.clientWidth / 2) * ratio - node.clientWidth / 2;
      node.scrollTop = (node.scrollTop + node.clientHeight / 2) * ratio - node.clientHeight / 2;
    }
    previousZoom.current = zoom;
  }, [zoom]);
  const fullscreenLabel = translate(
    fullscreen ? 'videoEditor.stage.exitFullscreen' : 'videoEditor.stage.enterFullscreen'
  );
  return (
    <div
      ref={frame}
      className={
        fullscreen
          ? 'flex h-full flex-col gap-2 bg-[var(--sniptale-color-surface-panel)] p-3'
          : 'grid min-w-0 gap-2'
      }
      data-ui="library-media-player"
    >
      <div
        ref={viewport}
        className={`${fullscreen ? 'min-h-0 flex-1' : 'aspect-video'} overflow-auto rounded-lg bg-black`}
        data-ui="library-media-viewport"
      >
        {props.src ? (
          <div
            style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
            data-ui="library-media-picture"
          >
            <video
              ref={video}
              className="block h-full w-full object-contain"
              src={props.src}
              preload="metadata"
              aria-label={props.filename}
              onLoadedMetadata={sync}
              onDurationChange={sync}
              onTimeUpdate={sync}
              onPlay={sync}
              onPause={sync}
              onEnded={sync}
              onVolumeChange={sync}
              onError={() => setFailed(true)}
            />
          </div>
        ) : (
          props.children
        )}
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.mediaPreviewActionFailed')}
        </p>
      ) : null}
      <LibraryMediaTransport playback={playback}>
        <ContentToolbarButton
          aria-label={fullscreenLabel}
          title={fullscreenLabel}
          disabled={!ready}
          onClick={() => {
            const request = fullscreen
              ? document.exitFullscreen?.()
              : frame.current?.requestFullscreen?.();
            void request?.catch(() => setFailed(true));
          }}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </ContentToolbarButton>
        <label className="flex w-32 shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
          <Search size={14} aria-hidden />
          <ProductRange
            className="min-w-0 flex-1"
            min={1}
            max={2}
            step={0.1}
            value={zoom}
            disabled={!ready}
            aria-label={translate('videoEditor.sidebar.mediaPreviewZoomLabel')}
            onChange={(event) => setZoom(Number(event.currentTarget.value))}
          />
          <span className="w-8 text-right">{Math.round(zoom * 100)}%</span>
        </label>
      </LibraryMediaTransport>
    </div>
  );
}

function useLibraryPlayback(src: string | null) {
  const video = useRef<HTMLVideoElement>(null);
  const [media, setMedia] = useState({ duration: 0, time: 0, paused: true, muted: false });
  const [failed, setFailed] = useState(false);
  const ready = src !== null && media.duration > 0;
  const sync = () => {
    const node = video.current;
    if (node)
      setMedia({
        duration: Number.isFinite(node.duration) ? node.duration : 0,
        time: node.currentTime,
        paused: node.paused,
        muted: node.muted,
      });
  };
  const toggle = useCallback(() => {
    const node = video.current;
    if (!node || node.readyState < 1) return;
    if (!node.paused) node.pause();
    else {
      setFailed(false);
      void node.play().catch(() => setFailed(true));
    }
  }, []);
  usePlaybackSpaceShortcut(toggle);
  useEffect(() => {
    const node = video.current;
    return () => node?.pause();
  }, [src]);
  return { video, media, ready, sync, toggle, failed, setFailed };
}

function LibraryMediaTransport(props: {
  playback: ReturnType<typeof useLibraryPlayback>;
  children: ReactNode;
}) {
  const { media, video, ready, sync, toggle } = props.playback;
  const playLabel = translate(
    media.paused ? 'videoEditor.timeline.play' : 'videoEditor.timeline.pause'
  );
  const muteLabel = translate(
    media.muted ? 'videoEditor.sidebar.mediaPreviewUnmute' : 'videoEditor.sidebar.mediaPreviewMute'
  );
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2" data-ui="library-media-transport">
      <ContentToolbarButton
        aria-label={playLabel}
        title={playLabel}
        disabled={!ready}
        onClick={toggle}
      >
        {media.paused ? <Play size={16} /> : <Pause size={16} />}
      </ContentToolbarButton>
      <ProductRange
        className="min-w-12 flex-1"
        min={0}
        max={media.duration || 1}
        step={0.01}
        value={media.time}
        disabled={!ready}
        aria-label={translate('videoEditor.sidebar.mediaPreviewSeek')}
        onChange={(event) => {
          if (video.current) {
            video.current.currentTime = Number(event.currentTarget.value);
            sync();
          }
        }}
      />
      <span className="whitespace-nowrap text-[11px] tabular-nums text-[var(--sniptale-color-text-muted)]">
        {formatDuration(media.time)} / {formatDuration(media.duration)}
      </span>
      <ContentToolbarButton
        aria-label={muteLabel}
        title={muteLabel}
        disabled={!ready}
        onClick={() => {
          if (video.current) {
            video.current.muted = !video.current.muted;
            sync();
          }
        }}
      >
        {media.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </ContentToolbarButton>
      {props.children}
    </div>
  );
}
