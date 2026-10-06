import { useState, type ReactNode } from 'react';
import { Maximize, Minimize, Pause, Play, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductRange } from '@sniptale/ui/product-form-controls';
import { useLibraryFullscreen } from '../../composition/library-preview/viewport';
import { translate } from '../../platform/i18n';
import { reviewTimeLabel } from './controls';

/** Native fullscreen retains the mounted scene and its one transport/resource owner. */
export function ReviewPreviewFrame(props: {
  children(fullscreen: boolean): ReactNode;
  time: number;
  duration: number;
  playing: boolean;
  disabled: boolean;
  onPlay(): void;
  onSeek(time: number): void;
}) {
  const [failed, setFailed] = useState(false);
  const fullscreen = useLibraryFullscreen(setFailed);
  const label = translate(
    fullscreen.fullscreen ? 'videoEditor.stage.exitFullscreen' : 'videoEditor.stage.enterFullscreen'
  );
  return (
    <div
      ref={fullscreen.frame}
      data-ui="gallery.videoReview.previewFrame"
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden
        bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]"
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === 'Escape' && fullscreen.fullscreen) {
          event.preventDefault();
          event.stopPropagation();
          fullscreen.exitFullscreen();
        } else if (
          [' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
            event.key
          ) &&
          event.target instanceof Element &&
          event.target.closest('button,input')
        ) {
          event.stopPropagation();
        }
      }}
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {props.children(fullscreen.fullscreen)}
        <ContentToolbarButton
          ref={fullscreen.fullscreenButton}
          dataUi="gallery.videoReview.fullscreen"
          tone="utility"
          className="!absolute !h-8 !min-h-8 !w-8 !p-0 right-2 top-2 z-20 !bg-[var(--sniptale-color-surface-panel)]
            opacity-70 hover:opacity-100 focus-visible:opacity-100"
          title={label}
          aria-label={label}
          disabled={!fullscreen.fullscreen && (props.disabled || !document.fullscreenEnabled)}
          onClick={() => {
            setFailed(false);
            if (fullscreen.fullscreen) fullscreen.exitFullscreen();
            else fullscreen.enterFullscreen();
          }}
        >
          {fullscreen.fullscreen ? (
            <Minimize size={18} aria-hidden />
          ) : (
            <Maximize size={18} aria-hidden />
          )}
        </ContentToolbarButton>
      </div>
      {failed ? (
        <div role="alert" className="flex items-center gap-2 px-3 py-1 text-xs">
          <span>{translate('gallery.videoReview.fullscreenFailed')}</span>
          <ContentToolbarButton
            aria-label={translate('gallery.videoReview.dismissFeedback')}
            onClick={() => setFailed(false)}
          >
            <X size={14} aria-hidden />
          </ContentToolbarButton>
        </div>
      ) : null}
      {fullscreen.fullscreen ? (
        <div
          data-ui="gallery.videoReview.fullscreenTransport"
          className="flex min-h-10 shrink-0 items-center gap-2 border-t
            border-[var(--sniptale-color-border-soft)] px-3 py-2"
        >
          <ContentToolbarButton
            disabled={props.disabled}
            onClick={props.onPlay}
            aria-label={translate(
              props.playing ? 'gallery.videoReview.pause' : 'gallery.videoReview.play'
            )}
          >
            {props.playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </ContentToolbarButton>
          <ProductRange
            className="min-w-12 flex-1"
            min={0}
            max={props.duration}
            step={0.01}
            value={Math.min(props.duration, Math.max(0, props.time))}
            disabled={props.disabled || props.duration <= 0}
            aria-label={translate('videoEditor.stage.fullscreenSeek')}
            onChange={(event) => props.onSeek(Number(event.currentTarget.value))}
          />
          <span className="whitespace-nowrap text-xs tabular-nums text-[var(--sniptale-color-text-secondary)]">
            {reviewTimeLabel(props.time)} / {reviewTimeLabel(props.duration)}
          </span>
          <ContentToolbarButton
            tone="close"
            onClick={fullscreen.exitFullscreen}
            aria-label={translate('videoEditor.stage.exitFullscreen')}
          >
            <X size={16} aria-hidden />
          </ContentToolbarButton>
        </div>
      ) : null}
    </div>
  );
}
