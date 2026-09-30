import { LoaderCircle, Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductRange, ProductSelect } from '@sniptale/ui/product-form-controls';
import type { ReactNode, RefObject } from 'react';
import { translate } from '../../platform/i18n';
import { videoTime } from './video-thumbnail';
import { VideoTimeline } from './video-timeline';
import type { useVideoPlayer } from './video-playback';

function PlayerButton(props: {
  label: string;
  onClick(): void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <ContentToolbarButton
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      tone="utility"
      size="compact"
      className="!h-9 !w-9 shrink-0 !p-0"
    >
      {props.children}
    </ContentToolbarButton>
  );
}

/** Groups media transport controls while playback state stays in the player hook. */
export function VideoControls({
  src,
  player,
}: {
  src: string;
  player: ReturnType<typeof useVideoPlayer>;
}) {
  const {
    video,
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
    buffering,
    ready,
    setFit,
    togglePlayback,
    toggleFullscreen,
    seek,
  } = player;
  return (
    <div
      className="shrink-0 border-t border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] px-3 py-2"
    >
      <div
        data-ui="gallery.preview.player.controls-row"
        className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs"
      >
        <div className="flex shrink-0 items-center gap-2">
          <PlayerButton
            label={translate(
              playing ? 'gallery.preview.player.pause' : 'gallery.preview.player.play'
            )}
            disabled={!ready || pending}
            onClick={() => void togglePlayback()}
          >
            {pending || buffering ? (
              <LoaderCircle
                size={16}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            ) : playing ? (
              <Pause size={16} aria-hidden />
            ) : (
              <Play size={16} aria-hidden />
            )}
          </PlayerButton>
          <span className="whitespace-nowrap tabular-nums text-[var(--sniptale-color-text-secondary)]">
            {videoTime(time)} / {videoTime(duration)}
          </span>
        </div>
        <div
          className="order-last min-w-0 w-full
          @min-[760px]/player:order-none @min-[760px]/player:w-auto @min-[760px]/player:flex-1"
        >
          <VideoTimeline
            src={src}
            duration={duration}
            time={time}
            ready={ready}
            seek={seek}
            playerRef={container}
          />
        </div>
        <PlaybackSettings video={video} muted={muted} volume={volume} speed={speed} />
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
          <ProductSelect<'fit' | 'original'>
            aria-label={translate('gallery.preview.player.scale')}
            value={fit ? 'fit' : 'original'}
            controlSize="sm"
            containerClassName="w-36 shrink-0"
            className="!h-9 !min-h-9 w-full"
            options={[
              { value: 'fit', label: translate('gallery.preview.player.fit') },
              { value: 'original', label: translate('gallery.preview.player.original') },
            ]}
            onChange={(value) => setFit(value === 'fit')}
          />
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
              {fullscreen ? <Minimize size={16} aria-hidden /> : <Maximize size={16} aria-hidden />}
            </PlayerButton>
          </div>
        </div>
      </div>
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
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <PlayerButton
        label={translate(muted ? 'gallery.preview.player.unmute' : 'gallery.preview.player.mute')}
        onClick={() => {
          if (video.current) video.current.muted = !video.current.muted;
        }}
      >
        {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
      </PlayerButton>
      <ProductRange
        aria-label={translate('gallery.preview.player.volume')}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        className="w-14 min-w-12"
        onChange={(event) => {
          if (video.current) {
            video.current.volume = event.currentTarget.valueAsNumber;
            video.current.muted = false;
          }
        }}
      />
      <ProductSelect<string>
        aria-label={translate('gallery.preview.player.speed')}
        value={String(speed)}
        controlSize="sm"
        containerClassName="w-16 shrink-0"
        className="!h-9 !min-h-9 w-full"
        options={[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => ({
          value: String(rate),
          label: `${rate}×`,
        }))}
        onChange={(value) => {
          if (video.current) video.current.playbackRate = Number(value);
        }}
      />
    </div>
  );
}
