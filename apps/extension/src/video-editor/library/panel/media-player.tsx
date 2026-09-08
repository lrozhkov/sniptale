import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
  type RefObject,
} from 'react';
import { Maximize2, Pause, Play, Search, Volume2, VolumeX, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductRange } from '@sniptale/ui/product-form-controls';
import { translate } from '../../../platform/i18n';
import { usePlaybackSpaceShortcut } from '../../runtime/session/playback/shortcuts';
import { formatDuration } from '../../chrome/display';

/** Disposable library playback owns its media element; it never edits project timing. */
export function LibraryMediaPlayer(props: {
  src: string | null;
  filename: string;
  kind?: 'video' | 'image';
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const previousZoom = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [imageReady, setImageReady] = useState(false);
  const pan = useLibraryPreviewPan(viewport, zoom > 1);
  const playback = useLibraryPlayback(props.src);
  const { video, sync, loadMetadata, failed, setFailed } = playback;
  const { frame, fullscreen, fullscreenButton, enterFullscreen, exitFullscreen } =
    useLibraryFullscreen(setFailed);
  const ready = props.kind === 'image' ? imageReady : playback.ready;
  useLayoutEffect(() => {
    const node = viewport.current;
    if (node) {
      const ratio = zoom / previousZoom.current;
      node.scrollLeft = (node.scrollLeft + node.clientWidth / 2) * ratio - node.clientWidth / 2;
      node.scrollTop = (node.scrollTop + node.clientHeight / 2) * ratio - node.clientHeight / 2;
    }
    previousZoom.current = zoom;
  }, [zoom]);
  useEffect(() => {
    setImageReady(false);
    setZoom(1);
    previousZoom.current = 1;
    if (viewport.current) {
      viewport.current.scrollLeft = 0;
      viewport.current.scrollTop = 0;
    }
  }, [props.src]);
  const fullscreenLabel = translate('videoEditor.stage.enterFullscreen');
  return (
    <div
      ref={frame}
      className={
        fullscreen
          ? 'flex h-full flex-col gap-2 bg-[var(--sniptale-color-surface-panel)] p-3'
          : 'flex min-h-0 min-w-0 flex-1 flex-col gap-2'
      }
      data-ui="library-media-player"
    >
      <div
        ref={viewport}
        {...pan.handlers}
        style={{
          cursor: zoom > 1 ? (pan.dragging ? 'grabbing' : 'grab') : undefined,
          touchAction: zoom > 1 ? 'none' : undefined,
        }}
        className="min-h-0 flex-1 overflow-auto rounded-lg bg-black"
        data-ui="library-media-viewport"
      >
        {props.src ? (
          <div
            style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
            data-ui="library-media-picture"
          >
            {props.kind === 'image' ? (
              <img
                src={props.src}
                alt={props.filename}
                draggable={false}
                className="block h-full w-full object-contain"
                onLoad={() => setImageReady(true)}
                onError={() => setFailed(true)}
              />
            ) : (
              <video
                ref={video}
                className="block h-full w-full object-contain"
                src={props.src}
                preload="metadata"
                aria-label={props.filename}
                onLoadedMetadata={loadMetadata}
                onDurationChange={sync}
                onTimeUpdate={sync}
                onPlay={sync}
                onPause={sync}
                onEnded={sync}
                onVolumeChange={sync}
                onError={() => {
                  sync();
                  setFailed(true);
                }}
              />
            )}
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
      <LibraryMediaTransport
        playback={playback}
        image={props.kind === 'image'}
        onExitFullscreen={fullscreen ? exitFullscreen : undefined}
        fullscreenButtonRef={fullscreenButton}
      >
        {!fullscreen ? (
          <ContentToolbarButton
            ref={fullscreenButton}
            aria-label={fullscreenLabel}
            title={fullscreenLabel}
            disabled={!ready}
            onClick={enterFullscreen}
          >
            <Maximize2 size={16} />
          </ContentToolbarButton>
        ) : null}
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

function useLibraryFullscreen(setFailed: (failed: boolean) => void) {
  const frame = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const previousFullscreen = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  useLayoutEffect(() => {
    if (previousFullscreen.current !== fullscreen) {
      fullscreenButton.current?.focus({ preventScroll: true });
      previousFullscreen.current = fullscreen;
    }
  }, [fullscreen]);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  return {
    frame,
    fullscreen,
    fullscreenButton,
    enterFullscreen: () => {
      void frame.current?.requestFullscreen?.().catch(() => setFailed(true));
    },
    exitFullscreen: () => {
      void document.exitFullscreen?.().catch(() => setFailed(true));
    },
  };
}

function useLibraryPlayback(src: string | null) {
  const video = useRef<HTMLVideoElement>(null);
  const probingDuration = useRef(false);
  const [media, setMedia] = useState<{
    duration: number | null;
    time: number;
    paused: boolean;
    muted: boolean;
    ready: boolean;
  }>({ duration: null, time: 0, paused: true, muted: false, ready: false });
  const [failed, setFailed] = useState(false);
  const ready = src !== null && media.ready;
  const sync = () => {
    const node = video.current;
    if (node) {
      if (probingDuration.current && Number.isFinite(node.duration) && node.duration > 0) {
        probingDuration.current = false;
        node.currentTime = 0;
      }
      setMedia({
        duration: Number.isFinite(node.duration) && node.duration > 0 ? node.duration : null,
        ready: node.readyState >= 1 && node.error === null && !probingDuration.current,
        time: probingDuration.current ? 0 : node.currentTime,
        paused: node.paused,
        muted: node.muted,
      });
    }
  };
  const loadMetadata = () => {
    const node = video.current;
    if (node && (!Number.isFinite(node.duration) || node.duration <= 0)) {
      probingDuration.current = true;
      node.currentTime = Number.MAX_SAFE_INTEGER;
    }
    sync();
  };
  const toggle = useCallback(() => {
    const node = video.current;
    if (!node || node.readyState < 1 || node.error || probingDuration.current) return;
    if (!node.paused) node.pause();
    else {
      setFailed(false);
      void node.play().catch(() => setFailed(true));
    }
  }, []);
  usePlaybackSpaceShortcut(toggle);
  useEffect(() => {
    probingDuration.current = false;
    setMedia({ duration: null, time: 0, paused: true, muted: false, ready: false });
    setFailed(false);
    const node = video.current;
    return () => node?.pause();
  }, [src]);
  return { video, media, ready, sync, loadMetadata, toggle, failed, setFailed };
}

function LibraryMediaTransport(props: {
  image: boolean;
  playback: ReturnType<typeof useLibraryPlayback>;
  onExitFullscreen: (() => void) | undefined;
  fullscreenButtonRef: RefObject<HTMLButtonElement | null>;
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
      {!props.image ? (
        <>
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
            disabled={!ready || media.duration === null}
            aria-label={translate('videoEditor.sidebar.mediaPreviewSeek')}
            onChange={(event) => {
              if (video.current) {
                video.current.currentTime = Number(event.currentTarget.value);
                sync();
              }
            }}
          />
          <span className="whitespace-nowrap text-[11px] tabular-nums text-[var(--sniptale-color-text-muted)]">
            {formatDuration(media.time)} /{' '}
            {media.duration === null ? '—' : formatDuration(media.duration)}
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
        </>
      ) : (
        <span className="flex-1" />
      )}
      {props.children}
      {props.onExitFullscreen ? (
        <ContentToolbarButton
          ref={props.fullscreenButtonRef}
          onClick={props.onExitFullscreen}
          title={translate('videoEditor.stage.exitFullscreen')}
          aria-label={translate('videoEditor.stage.exitFullscreen')}
          dataUi="library-media-fullscreen-close"
        >
          <X size={16} aria-hidden="true" />
        </ContentToolbarButton>
      ) : null}
    </div>
  );
}

function useLibraryPreviewPan(viewport: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const gesture = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  const finish = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (active && viewport.current?.hasPointerCapture(active.id)) {
      viewport.current.releasePointerCapture(active.id);
    }
  }, [viewport]);
  useEffect(() => {
    if (!enabled) finish();
    return finish;
  }, [enabled, finish]);
  return {
    dragging,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (!enabled || event.button !== 0 || gesture.current) return;
        event.preventDefault();
        const node = event.currentTarget;
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: node.scrollLeft,
          top: node.scrollTop,
        };
        node.setPointerCapture(event.pointerId);
        setDragging(true);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId) return;
        event.currentTarget.scrollLeft = active.left + active.x - event.clientX;
        event.currentTarget.scrollTop = active.top + active.y - event.clientY;
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        if (gesture.current?.id === event.pointerId) finish();
      },
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => {
        if (gesture.current?.id === event.pointerId) finish();
      },
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
        if (gesture.current?.id === event.pointerId) finish();
      },
    },
  };
}
