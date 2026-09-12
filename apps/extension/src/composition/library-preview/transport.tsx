import type { useLibraryViewport } from './viewport';
import type { RefObject, ReactNode } from 'react';
import { Pause, Play, Volume2, VolumeX, X, Maximize2, Search } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductRange, ProductInput } from '@sniptale/ui/product-form-controls';
import { translate } from '../../platform/i18n';
import type { useLibraryPlayback } from './playback';
function formatDuration(duration: number) {
  return `${Math.floor(duration / 60)}:${(duration % 60).toFixed(1).padStart(4, '0')}`;
}
/** Shared transport controls never mutate project timing. */
export function LibraryMediaTransport(props: {
  image: boolean;
  timeline?: ReactNode;
  playback: ReturnType<typeof useLibraryPlayback>;
  onExitFullscreen: (() => void) | undefined;
  fullscreenButtonRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const { media, ready, toggle, toggleMute } = props.playback;
  const playLabel = translate(
    media.paused ? 'videoEditor.timeline.play' : 'videoEditor.timeline.pause'
  );
  const muteLabel = translate(
    media.muted ? 'videoEditor.sidebar.mediaPreviewUnmute' : 'videoEditor.sidebar.mediaPreviewMute'
  );
  return (
    <div
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-2"
      data-ui="library-media-transport"
    >
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
          <LibrarySeek playback={props.playback} timeline={props.timeline} />
          <span className="whitespace-nowrap text-[11px] tabular-nums text-[var(--sniptale-color-text-muted)]">
            {formatDuration(media.time)} /{' '}
            {media.duration === null ? '—' : formatDuration(media.duration)}
          </span>
          <ContentToolbarButton
            aria-label={muteLabel}
            title={muteLabel}
            disabled={!ready}
            onClick={toggleMute}
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

function LibrarySeek({
  playback,
  timeline,
}: {
  playback: ReturnType<typeof useLibraryPlayback>;
  timeline?: ReactNode;
}) {
  const { media, ready, seek } = playback;
  return (
    <>
      {timeline ?? (
        <ProductRange
          className="order-first w-full shrink-0"
          min={0}
          max={media.duration || 1}
          step={0.01}
          value={media.time}
          disabled={!ready || media.duration === null}
          aria-label={translate('videoEditor.sidebar.mediaPreviewSeek')}
          onChange={(event) => seek(event.currentTarget.valueAsNumber)}
        />
      )}
      <ProductInput
        type="number"
        style={{ width: '5rem', flex: '0 0 5rem' }}
        className="w-20 !min-h-7 !h-7 text-xs tabular-nums"
        min={0}
        max={media.duration ?? 0}
        step={0.01}
        value={Number(media.time.toFixed(2))}
        disabled={!ready || media.duration === null}
        aria-label={translate('videoEditor.app.sourcePosition')}
        onChange={(event) => seek(event.currentTarget.valueAsNumber)}
      />
    </>
  );
}

/** Zoom and fullscreen controls share the transport row while viewport owns their lifecycle. */
export function LibraryViewControls({
  state,
  ready,
}: {
  state: ReturnType<typeof useLibraryViewport>;
  ready: boolean;
}) {
  const { fullscreen, fullscreenButton, enterFullscreen, zoom, setZoom } = state;
  const fullscreenLabel = translate('videoEditor.stage.enterFullscreen');
  return (
    <>
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
    </>
  );
}
