import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
  type RefObject,
  type VideoHTMLAttributes,
} from 'react';
import { translate, useAppLocale } from '../../../platform/i18n';
import { VideoThumbnail, videoTime } from './video-thumbnail';

function PlayerButton(props: {
  label: string;
  onClick(): void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--sniptale-radius-md)]
        hover:bg-[var(--sniptale-color-surface-canvas)]
        focus-visible:outline focus-visible:outline-2 disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

/** Owns playback events and commands for one mounted source. */
function useVideoPlayer() {
  const video = useRef<HTMLVideoElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLDivElement>(null);
  const probe = useRef(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fit, setFit] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'media' | 'action' | null>(null);
  const ready = duration > 0 && error !== 'media';

  useEffect(() => {
    let wasFullscreen = false;
    const update = () => {
      const active = document.fullscreenElement === container.current;
      setFullscreen(active);
      if (wasFullscreen && !active) fullscreenButton.current?.querySelector('button')?.focus();
      wasFullscreen = active;
    };
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const readDuration = (element: HTMLVideoElement) => {
    if (!Number.isFinite(element.duration) || element.duration <= 0) return;
    if (probe.current) {
      probe.current = false;
      element.currentTime = 0;
    }
    setDuration(element.duration);
  };
  const togglePlayback = async () => {
    if (!video.current || pending || !ready) return;
    setError((current) => (current === 'media' ? current : null));
    if (!video.current.paused) {
      video.current.pause();
      return;
    }
    setPending(true);
    try {
      await video.current.play();
    } catch {
      setError((current) => (current === 'media' ? current : 'action'));
    } finally {
      setPending(false);
    }
  };
  const toggleFullscreen = async () => {
    if (pending) return;
    setPending(true);
    setError((current) => (current === 'media' ? current : null));
    try {
      if (document.fullscreenElement === container.current) await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch {
      setError((current) => (current === 'media' ? current : 'action'));
    } finally {
      setPending(false);
    }
  };
  const seek = (value: number) => {
    if (!video.current || !ready || !Number.isFinite(value)) return;
    video.current.currentTime = Math.max(0, Math.min(duration, value));
    setTime(video.current.currentTime);
  };

  const mediaEvents: VideoHTMLAttributes<HTMLVideoElement> = {
    onLoadedMetadata: (event) => {
      const element = event.currentTarget;
      if (!Number.isFinite(element.duration) || element.duration <= 0) {
        probe.current = true;
        element.currentTime = Number.MAX_SAFE_INTEGER;
      } else readDuration(element);
    },
    onDurationChange: (event) => readDuration(event.currentTarget),
    onTimeUpdate: (event) => {
      if (!probe.current) setTime(event.currentTarget.currentTime);
    },
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onVolumeChange: (event) => {
      setVolume(event.currentTarget.volume);
      setMuted(event.currentTarget.muted);
    },
    onRateChange: (event) => setSpeed(event.currentTarget.playbackRate),
    onError: () => setError('media'),
  };
  return {
    video,
    mediaEvents,
    container,
    fullscreenButton,
    duration,
    time,
    playing,
    volume,
    muted,
    speed,
    fit,
    fullscreen,
    pending,
    error,
    ready,
    setFit,
    togglePlayback,
    toggleFullscreen,
    seek,
  };
}

/** Gallery controls remain inside their fullscreen and locale owner. */
export function PreviewVideo({ src, trashMode = false }: { src: string; trashMode?: boolean }) {
  useAppLocale();
  const {
    video,
    mediaEvents,
    container,
    fullscreenButton,
    duration,
    time,
    playing,
    volume,
    muted,
    speed,
    fit,
    fullscreen,
    pending,
    error,
    ready,
    setFit,
    togglePlayback,
    toggleFullscreen,
    seek,
  } = useVideoPlayer();
  return (
    <div
      ref={container}
      data-ui="gallery.preview.player"
      className="relative flex h-full w-full min-h-0 min-w-0 flex-col
        bg-[var(--sniptale-color-surface-canvas)] text-[var(--sniptale-color-text-primary)]"
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
      <div className="shrink-0 bg-[var(--sniptale-color-surface-panel)] px-3 py-2">
        <VideoTimeline src={src} duration={duration} time={time} ready={ready} seek={seek} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <PlayerButton
            label={translate(
              playing ? 'gallery.preview.player.pause' : 'gallery.preview.player.play'
            )}
            disabled={!ready || pending}
            onClick={() => void togglePlayback()}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </PlayerButton>
          <span className="tabular-nums">
            {videoTime(time)} / {videoTime(duration)}
          </span>
          <PlaybackSettings video={video} muted={muted} volume={volume} speed={speed} />
          <select
            aria-label={translate('gallery.preview.player.scale')}
            value={fit ? 'fit' : 'original'}
            className="ml-auto max-w-full rounded bg-[var(--sniptale-color-surface-canvas)] p-2"
            onChange={(event) => setFit(event.currentTarget.value === 'fit')}
          >
            <option value="fit">{translate('gallery.preview.player.fit')}</option>
            <option value="original">{translate('gallery.preview.player.original')}</option>
          </select>
          <div ref={fullscreenButton}>
            <PlayerButton
              label={translate(
                fullscreen
                  ? 'gallery.preview.player.exitFullscreen'
                  : 'gallery.preview.player.fullscreen'
              )}
              disabled={pending}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </PlayerButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Owns transient timeline previews independently of playback commands. */
function VideoTimeline({
  src,
  duration,
  time,
  ready,
  seek,
}: {
  src: string;
  duration: number;
  time: number;
  ready: boolean;
  seek(value: number): void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="relative" onPointerLeave={() => setHover(null)}>
      {hover !== null && ready ? (
        <div className="absolute inset-x-0 bottom-full pb-2">
          <VideoThumbnail src={src} time={hover} />
        </div>
      ) : null}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step="any"
        value={Math.min(time, duration)}
        disabled={!ready}
        aria-label={translate('gallery.preview.player.seek')}
        aria-valuetext={`${videoTime(time)} / ${videoTime(duration)}`}
        onChange={(event) => seek(event.currentTarget.valueAsNumber)}
        onPointerMove={(event) => {
          if (!ready) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (bounds.width > 0)
            setHover(
              Math.round(
                Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) *
                  duration *
                  10
              ) / 10
            );
        }}
        onFocus={() => setHover(time)}
        onBlur={() => setHover(null)}
        className="block h-6 w-full accent-[var(--sniptale-color-accent)]"
      />
    </div>
  );
}

/** Audio and playback-rate settings use the media element as their authority. */
function PlaybackSettings({
  video,
  muted,
  volume,
  speed,
}: {
  video: RefObject<HTMLVideoElement | null>;
  muted: boolean;
  volume: number;
  speed: number;
}) {
  return (
    <>
      <PlayerButton
        label={translate(muted ? 'gallery.preview.player.unmute' : 'gallery.preview.player.mute')}
        onClick={() => {
          if (video.current) video.current.muted = !video.current.muted;
        }}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </PlayerButton>
      <input
        aria-label={translate('gallery.preview.player.volume')}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        className="w-20 accent-[var(--sniptale-color-accent)]"
        onChange={(event) => {
          if (video.current) {
            video.current.volume = event.currentTarget.valueAsNumber;
            video.current.muted = false;
          }
        }}
      />
      <select
        aria-label={translate('gallery.preview.player.speed')}
        value={speed}
        className="rounded bg-[var(--sniptale-color-surface-canvas)] p-2"
        onChange={(event) => {
          if (video.current) video.current.playbackRate = Number(event.currentTarget.value);
        }}
      >
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
          <option key={rate} value={rate}>
            {rate}×
          </option>
        ))}
      </select>
    </>
  );
}

function handleVideoScrollKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key.startsWith('Arrow')) event.stopPropagation();
}
