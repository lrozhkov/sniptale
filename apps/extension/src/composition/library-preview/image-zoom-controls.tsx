import { LockKeyhole, LockKeyholeOpen, Minus, Plus } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { ProductRange } from '@sniptale/ui/product-form-controls';
import { translate } from '../../platform/i18n';
import { PreviewFloatingControl } from './preview-floating-control';
import type { usePreviewImageZoom } from './usePreviewImageZoom';

export function PreviewZoomControls(props: {
  controls: ReturnType<typeof usePreviewImageZoom>['controls'];
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pointerActive, setPointerActive] = useState(false);
  const showSlider = hovered || focusWithin || pointerActive || props.controls.zoomLocked;

  useEffect(() => {
    if (!pointerActive) return;
    const release = () => setPointerActive(false);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [pointerActive]);

  return (
    <div className="flex max-w-full items-center gap-1.5">
      <PreviewFloatingControl
        ariaLabel={translate('gallery.preview.zoomOut')}
        disabled={props.disabled || !props.controls.canZoomOut}
        onClick={props.controls.zoomOut}
      >
        <Minus className="h-4 w-4" />
      </PreviewFloatingControl>
      <div
        data-ui="gallery.preview.zoomSliderGroup"
        className="relative shrink-0"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) {
            setFocusWithin(true);
          }
        }}
        onKeyDownCapture={() => setFocusWithin(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setFocusWithin(false);
          }
        }}
      >
        <button
          type="button"
          onClick={props.controls.resetZoom}
          disabled={props.disabled}
          title={translate('gallery.preview.resetZoom')}
          aria-expanded={showSlider}
          className="h-9 w-16 shrink-0 rounded-[8px] border-0 bg-transparent px-2 py-2
            text-center text-xs font-semibold tabular-nums
            text-[var(--sniptale-color-text-primary)] transition
            hover:bg-[var(--sniptale-color-surface-hover)]
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--sniptale-color-accent)]
            disabled:cursor-not-allowed disabled:opacity-40"
        >
          {Math.round(props.controls.zoom * 100)}%
        </button>
        <div
          data-ui="gallery.preview.zoomSliderPanel"
          inert={!showSlider}
          onPointerDownCapture={() => setPointerActive(true)}
          className={`absolute right-0 top-full z-30 pt-1 ${
            showSlider ? '' : 'invisible pointer-events-none'
          }`}
        >
          <div
            className="flex items-center gap-1 rounded-[8px] border
              border-[var(--sniptale-color-border-soft)]
              bg-[var(--sniptale-color-surface-panel)] px-2 shadow-sm"
          >
            <ProductRange
              data-ui="gallery.preview.zoomSlider"
              aria-label={translate('gallery.preview.zoomSlider')}
              aria-valuetext={`${Math.round(props.controls.zoom * 100)}%`}
              min={props.controls.minimumZoom}
              max={props.controls.maximumZoom}
              step="any"
              value={props.controls.zoom}
              disabled={props.disabled}
              tabIndex={showSlider ? 0 : -1}
              onChange={(event) => props.controls.setZoom(event.currentTarget.valueAsNumber)}
              style={
                {
                  '--sniptale-range-track-height': '4px',
                  '--sniptale-range-thumb-size': '12px',
                } as CSSProperties
              }
              className="w-28 shrink-0 focus-visible:ring-2
                focus-visible:ring-[var(--sniptale-color-accent)]
                disabled:cursor-not-allowed disabled:opacity-40"
            />
            <PreviewFloatingControl
              ariaLabel={translate('gallery.preview.zoomLockToggle')}
              title={translate(
                props.controls.zoomLocked
                  ? 'gallery.preview.unlockZoom'
                  : 'gallery.preview.lockZoom'
              )}
              onClick={props.controls.toggleZoomLock}
              pressed={props.controls.zoomLocked}
              disabled={props.disabled}
              tabIndex={showSlider ? 0 : -1}
            >
              {props.controls.zoomLocked ? (
                <LockKeyhole className="h-4 w-4" />
              ) : (
                <LockKeyholeOpen className="h-4 w-4" />
              )}
            </PreviewFloatingControl>
          </div>
        </div>
      </div>
      <PreviewFloatingControl
        ariaLabel={translate('gallery.preview.zoomIn')}
        disabled={props.disabled || !props.controls.canZoomIn}
        onClick={props.controls.zoomIn}
      >
        <Plus className="h-4 w-4" />
      </PreviewFloatingControl>
    </div>
  );
}
