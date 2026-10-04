import type { useLibraryViewport } from './viewport';
import type { RefObject, ReactNode } from 'react';
import {
  Pause,
  Play,
  Volume2,
  VolumeX,
  Minimize2,
  Maximize2,
  Search,
  Minus,
  Plus,
} from 'lucide-react';
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
    media.muted || media.volume === 0
      ? 'videoEditor.sidebar.mediaPreviewUnmute'
      : 'videoEditor.sidebar.mediaPreviewMute'
  );
  return (
    <div
      className={[
        'flex min-w-0 shrink-0 flex-wrap items-center justify-start gap-2',
        props.image ? 'sniptale-toolbar-root' : '',
      ].join(' ')}
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
            {media.muted || media.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </ContentToolbarButton>
          <label className="flex w-28 items-center gap-2">
            <ProductRange
              min={0}
              max={1}
              step={0.05}
              value={media.muted ? 0 : media.volume}
              disabled={!ready}
              aria-label={translate('videoEditor.sidebar.mediaPreviewVolume')}
              aria-valuetext={`${Math.round((media.muted ? 0 : media.volume) * 100)}%`}
              onChange={(event) => props.playback.setVolume(event.currentTarget.valueAsNumber)}
            />
          </label>
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
          <Minimize2 size={16} aria-hidden="true" />
        </ContentToolbarButton>
      ) : null}
      {!props.image && (
        <p className="w-full text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.mediaPreviewZoomHint')}
        </p>
      )}
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
          aria-valuetext={formatDuration(media.time)}
          onChange={(event) => seek(event.currentTarget.valueAsNumber)}
        />
      )}
      {timeline ? (
        <label className="flex items-center gap-2 text-xs">
          {translate('videoEditor.app.sourcePosition')}
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
        </label>
      ) : null}
    </>
  );
}

/** Zoom and fullscreen controls share the transport row while viewport owns their lifecycle. */
export function LibraryViewControls({
  state,
  ready,
  image,
}: {
  state: ReturnType<typeof useLibraryViewport>;
  ready: boolean;
  image: boolean;
}) {
  const { fullscreen, fullscreenButton, enterFullscreen, zoom, setZoom } = state;
  const zoomLabel = translate(
    image
      ? 'videoEditor.sidebar.mediaPreviewImageZoomLabel'
      : 'videoEditor.sidebar.mediaPreviewZoomLabel'
  );
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
      {image ? (
        <LibraryImageZoomControls state={state} ready={ready} />
      ) : (
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs tabular-nums">
          <span>{zoomLabel}</span>
          <Search size={14} aria-hidden />
          <ProductRange
            className="!w-24"
            min={1}
            max={2}
            step={0.1}
            value={zoom}
            disabled={!ready}
            aria-label={zoomLabel}
            onChange={(event) => setZoom(Math.max(1, Number(event.currentTarget.value)))}
          />
          <span className="min-w-10 text-right">{zoom.toFixed(1)}×</span>
        </label>
      )}
      <ContentToolbarButton
        className="!w-auto !px-3 text-xs"
        disabled={!ready}
        aria-pressed={zoom === 1}
        onClick={() => setZoom(1)}
      >
        {translate('videoEditor.sidebar.mediaPreviewFit')}
      </ContentToolbarButton>
    </>
  );
}

/** Compact image controls adapt pixel scale to the viewport's existing normalized zoom. */
function LibraryImageZoomControls({
  state,
  ready,
}: {
  state: ReturnType<typeof useLibraryViewport>;
  ready: boolean;
}) {
  const scale = state.zoom * state.fitScale;
  const setScale = (value: number) =>
    state.setZoom(Math.max(state.fitScale, Math.min(4, value)) / state.fitScale);
  return (
    <>
      <ContentToolbarButton
        aria-label={translate('gallery.preview.zoomOut')}
        title={translate('gallery.preview.zoomOut')}
        disabled={!ready || state.zoom <= 1}
        onClick={() => setScale(scale / 1.25)}
      >
        <Minus size={16} aria-hidden="true" />
      </ContentToolbarButton>
      <ProductRange
        className="!w-24"
        min={state.fitScale}
        max={4}
        step={0.01}
        value={scale}
        disabled={!ready}
        aria-label={translate('videoEditor.sidebar.mediaPreviewImageZoomLabel')}
        aria-valuetext={`${Math.round(scale * 100)}%`}
        onChange={(event) => setScale(event.currentTarget.valueAsNumber)}
      />
      <span className="min-w-10 text-right text-xs tabular-nums">{Math.round(scale * 100)}%</span>
      <ContentToolbarButton
        aria-label={translate('gallery.preview.zoomIn')}
        title={translate('gallery.preview.zoomIn')}
        disabled={!ready || scale >= 4}
        onClick={() => setScale(scale * 1.25)}
      >
        <Plus size={16} aria-hidden="true" />
      </ContentToolbarButton>
      <ContentToolbarButton
        className="!w-auto !px-3 text-xs"
        disabled={!ready}
        aria-pressed={Math.abs(scale - 1) < 0.001}
        onClick={() => setScale(1)}
      >
        100%
      </ContentToolbarButton>
    </>
  );
}
