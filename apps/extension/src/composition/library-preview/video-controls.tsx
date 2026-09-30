import {
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductRange, ProductSelect } from '@sniptale/ui/product-form-controls';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { translate } from '../../platform/i18n';
import { videoTime } from './video-thumbnail';
import { VideoTimeline } from './video-timeline';
import type { useVideoPlayer } from './video-playback';
import type { useVideoControlsVisibility } from './video-controls-visibility';

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
  visibility,
}: {
  src: string;
  player: ReturnType<typeof useVideoPlayer>;
  visibility: ReturnType<typeof useVideoControlsVisibility>;
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
      ref={visibility.controls}
      data-ui="gallery.preview.player.controls"
      data-fullscreen={fullscreen}
      data-visible={visibility.visible}
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
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ProductSelect<'fit' | 'original'>
            aria-label={translate('gallery.preview.player.scale')}
            title={translate(
              fit ? 'gallery.preview.player.fit' : 'gallery.preview.player.original'
            )}
            value={fit ? 'fit' : 'original'}
            controlSize="sm"
            containerClassName="!w-[152px] shrink-0"
            className="!h-9 !min-h-9 !w-full"
            style={
              {
                '--sniptale-field-padding-inline-start': '8px',
                '--sniptale-field-padding-inline-end': '28px',
              } as CSSProperties
            }
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
  const audibleVolume = muted ? 0 : volume;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div
        data-ui="gallery.preview.player.volumeGroup"
        role="group"
        aria-label={translate('gallery.preview.player.volume')}
        className="flex shrink-0 items-center gap-1"
      >
        <PlayerButton
          label={translate(muted ? 'gallery.preview.player.unmute' : 'gallery.preview.player.mute')}
          onClick={() => {
            if (video.current) video.current.muted = !video.current.muted;
          }}
        >
          {muted ? (
            <VolumeX size={16} aria-hidden />
          ) : volume === 0 ? (
            <Volume size={16} aria-hidden />
          ) : volume < 0.5 ? (
            <Volume1 size={16} aria-hidden />
          ) : (
            <Volume2 size={16} aria-hidden />
          )}
        </PlayerButton>
        <ProductRange
          aria-label={translate('gallery.preview.player.volume')}
          aria-valuetext={`${Math.round(audibleVolume * 100)}%`}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={audibleVolume}
          style={
            {
              '--sniptale-range-track-height': '4px',
              '--sniptale-range-thumb-size': '12px',
            } as CSSProperties
          }
          className="!w-16 shrink-0 focus-visible:ring-2
            focus-visible:ring-[var(--sniptale-color-accent)]"
          onChange={(event) => {
            if (video.current) {
              video.current.volume = event.currentTarget.valueAsNumber;
              video.current.muted = false;
            }
          }}
        />
        <output
          aria-hidden="true"
          className="w-9 shrink-0 text-right text-xs font-medium tabular-nums
            text-[var(--sniptale-color-text-secondary)]"
        >
          {Math.round(audibleVolume * 100)}%
        </output>
      </div>
      <ProductSelect<string>
        aria-label={translate('gallery.preview.player.speed')}
        title={`${speed}×`}
        value={String(speed)}
        controlSize="sm"
        containerClassName="!w-[84px] shrink-0"
        className="!h-9 !min-h-9 !w-full"
        style={
          {
            '--sniptale-field-padding-inline-start': '8px',
            '--sniptale-field-padding-inline-end': '28px',
          } as CSSProperties
        }
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
