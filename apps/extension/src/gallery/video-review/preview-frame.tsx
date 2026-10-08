import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minimize, Pause, Play, Settings, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductRange } from '@sniptale/ui/product-form-controls';
import { useLibraryFullscreen } from '../../composition/library-preview/viewport';
import { translate } from '../../platform/i18n';
import { reviewTimeLabel } from './controls';

/** Native fullscreen retains the mounted scene and its one transport/resource owner. */
type PreviewFrameProps = {
  children(fullscreen: boolean): ReactNode;
  time: number;
  duration: number;
  playing: boolean;
  disabled: boolean;
  onOpenPreviewSettings?: ((trigger: HTMLButtonElement) => void) | undefined;
  onPlay(): void;
  onSeek(time: number): void;
};

function usePreviewFullscreen(onOpenPreviewSettings: PreviewFrameProps['onOpenPreviewSettings']) {
  const [failed, setFailed] = useState(false);
  const opening = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const fullscreen = useLibraryFullscreen(setFailed);
  const openSettings = async (trigger: HTMLButtonElement) => {
    if (opening.current) return;
    opening.current = true;
    setFailed(false);
    try {
      if (fullscreen.fullscreen && !(await fullscreen.exitFullscreenForHandoff())) return;
      if (mounted.current) onOpenPreviewSettings?.(trigger);
    } finally {
      opening.current = false;
    }
  };
  return { fullscreen, failed, setFailed, openSettings };
}

export function ReviewPreviewFrame(props: PreviewFrameProps) {
  const { fullscreen, failed, setFailed, openSettings } = usePreviewFullscreen(
    props.onOpenPreviewSettings
  );
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
          void fullscreen.exitFullscreen();
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
        {props.onOpenPreviewSettings ? (
          <ContentToolbarButton
            dataUi="gallery.videoReview.previewSettings"
            tone="utility"
            className="!absolute !h-8 !min-h-8 !w-8 !p-0 right-12 top-2 z-20
              !bg-[var(--sniptale-color-surface-panel)] opacity-70 hover:opacity-100 focus-visible:opacity-100"
            title={translate('gallery.videoReview.previewSettings')}
            aria-label={translate('gallery.videoReview.previewSettings')}
            disabled={props.disabled}
            onClick={(event) => void openSettings(event.currentTarget)}
          >
            <Settings size={18} aria-hidden />
          </ContentToolbarButton>
        ) : null}
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
            if (fullscreen.fullscreen) void fullscreen.exitFullscreen();
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
