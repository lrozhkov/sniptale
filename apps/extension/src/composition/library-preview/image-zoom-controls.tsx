import { LockKeyhole, LockKeyholeOpen, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { ProductRange } from '@sniptale/ui/product-form-controls';
import { translate } from '../../platform/i18n';
import { PreviewFloatingControl } from './preview-floating-control';
import type { usePreviewImageZoom } from './usePreviewImageZoom';

export function PreviewZoomControls(props: {
  controls: ReturnType<typeof usePreviewImageZoom>['controls'];
  disabled: boolean;
}) {
  const [interacting, setInteracting] = useState(false);
  const showLock = interacting || props.controls.isZoomedFromFit || props.controls.zoomLocked;

  return (
    <div className="flex max-w-full items-center gap-1.5">
      <PreviewFloatingControl
        ariaLabel={translate('gallery.preview.zoomOut')}
        disabled={props.disabled || !props.controls.canZoomOut}
        onClick={props.controls.zoomOut}
      >
        <Minus className="h-4 w-4" />
      </PreviewFloatingControl>
      <button
        type="button"
        onClick={props.controls.resetZoom}
        disabled={props.disabled}
        title={translate('gallery.preview.resetZoom')}
        className="h-9 min-w-14 rounded-[8px] border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
          px-3 py-2 text-xs font-semibold text-[var(--sniptale-color-text-primary)] shadow-sm
          transition hover:border-[var(--sniptale-color-border-strong)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]
          disabled:cursor-not-allowed disabled:opacity-40"
      >
        {Math.round(props.controls.zoom * 100)}%
      </button>
      <PreviewFloatingControl
        ariaLabel={translate('gallery.preview.zoomIn')}
        disabled={props.disabled || !props.controls.canZoomIn}
        onClick={props.controls.zoomIn}
      >
        <Plus className="h-4 w-4" />
      </PreviewFloatingControl>
      <div
        data-ui="gallery.preview.zoomSliderGroup"
        className="flex items-center gap-1"
        onPointerEnter={() => setInteracting(true)}
        onPointerLeave={() => setInteracting(false)}
        onFocusCapture={() => setInteracting(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setInteracting(false);
          }
        }}
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
          onChange={(event) => props.controls.setZoom(event.currentTarget.valueAsNumber)}
          className="w-28 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <span aria-hidden={!showLock} className={showLock ? '' : 'invisible pointer-events-none'}>
          <PreviewFloatingControl
            ariaLabel={translate('gallery.preview.zoomLockToggle')}
            title={translate(
              props.controls.zoomLocked ? 'gallery.preview.unlockZoom' : 'gallery.preview.lockZoom'
            )}
            onClick={props.controls.toggleZoomLock}
            pressed={props.controls.zoomLocked}
            disabled={props.disabled}
            tabIndex={showLock ? 0 : -1}
          >
            {props.controls.zoomLocked ? (
              <LockKeyhole className="h-4 w-4" />
            ) : (
              <LockKeyholeOpen className="h-4 w-4" />
            )}
          </PreviewFloatingControl>
        </span>
      </div>
    </div>
  );
}
