import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductDropdownMenu } from '@sniptale/ui/product-menus/dropdown';
import { useGlassSelectOverlay } from '@sniptale/ui/glass-select/overlay-state';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { translate } from '../../../../platform/i18n';
import type {
  VideoEditorPreviewMode,
  VideoEditorPreviewRasterPreset,
  VideoEditorPreviewZoom,
} from '../../../contracts/preview-runtime';

interface PreviewDisplaySettingsProps {
  mode: VideoEditorPreviewMode;
  onModeChange: (mode: VideoEditorPreviewMode) => void;
  rasterPreset: VideoEditorPreviewRasterPreset;
  onRasterPresetChange: (preset: VideoEditorPreviewRasterPreset) => void;
  zoom: VideoEditorPreviewZoom;
  onZoomChange: (zoom: VideoEditorPreviewZoom) => void;
}

export function PreviewDisplaySettings(props: PreviewDisplaySettingsProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const setVisible = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    setOpen(next);
    if (next === false) triggerRef.current?.focus();
  }, []);
  const { portalStyle } = useGlassSelectOverlay({
    portal: true,
    isOpen: open,
    setIsOpen: setVisible,
    containerRef,
    menuRef,
  });
  const theme = useResolvedPortalTheme(triggerRef.current);
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, [open]);
  const modeLabel = translate(
    props.mode === 'live'
      ? 'videoEditor.stage.previewModeLive'
      : 'videoEditor.stage.previewModeCache'
  );
  const zoomLabel =
    props.zoom === 'fit' ? translate('videoEditor.stage.previewZoomFit') : props.zoom;
  return (
    <div ref={containerRef}>
      <ContentToolbarButton
        ref={triggerRef}
        type="button"
        dataUi="video.preview.display-settings"
        className="!h-9 !gap-1.5 !px-2.5 whitespace-nowrap"
        aria-label={translate('videoEditor.stage.displaySettings')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setVisible(!open)}
      >
        <span>
          {modeLabel} · {props.rasterPreset} · {zoomLabel}
        </span>
        <ChevronDown size={12} aria-hidden="true" />
      </ContentToolbarButton>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={id}
              className="rounded-xl bg-[var(--sniptale-color-surface-canvas)]"
              role="dialog"
              aria-label={translate('videoEditor.stage.displaySettings')}
              data-theme={theme ?? undefined}
              data-ui="video.preview.display-settings.panel"
              style={{
                ...portalStyle,
                left: Math.max(8, Math.min(Number(portalStyle.left ?? 0), window.innerWidth - 248)),
                width: 240,
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setVisible(false);
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <PreviewDisplayChoices {...props} />
            </div>,
            resolveThemeSafePortalTarget(triggerRef.current)
          )
        : null}
    </div>
  );
}

const RASTER_OPTIONS = (['360p', '540p', '720p', '1080p', '1440p', '2160p'] as const).map(
  (value) => ({ value, label: value })
);

function DisplayChoiceSection<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset
      className={[
        'm-0 min-w-0 border-0 border-b border-solid border-[var(--sniptale-color-border-soft)] px-0',
        'pb-2 last-of-type:border-b-0',
      ].join(' ')}
    >
      <legend className="px-2 py-1 text-[11px] font-semibold text-[var(--sniptale-color-text-muted)]">
        {props.label}
      </legend>
      {props.options.map((option) => (
        <label
          key={option.value}
          title={option.title}
          className={[
            'flex min-h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-xs',
            'text-[var(--sniptale-color-text-primary)] hover:bg-[var(--sniptale-color-surface-panel)]',
            'focus-within:outline focus-within:outline-1',
            'focus-within:outline-[var(--sniptale-color-focus-ring)]',
          ].join(' ')}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={props.value === option.value}
            onChange={() => props.onChange(option.value)}
            className="m-0 focus-visible:outline-none accent-[var(--sniptale-color-accent)]"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function PreviewDisplayChoices(props: PreviewDisplaySettingsProps) {
  return (
    <ProductDropdownMenu
      className={[
        '!relative !inset-auto !m-0 !w-full !min-w-0',
        '!max-h-[calc(100vh-32px)] overflow-y-auto !p-2',
      ].join(' ')}
    >
      <DisplayChoiceSection
        label={translate('videoEditor.stage.previewMode')}
        value={props.mode}
        onChange={props.onModeChange}
        options={[
          { value: 'live', label: translate('videoEditor.stage.previewModeLive') },
          {
            value: 'cache',
            label: translate('videoEditor.stage.previewModeCache'),
            title: translate('videoEditor.stage.previewCacheRetentionDisclosure'),
          },
        ]}
      />
      <DisplayChoiceSection
        label={translate('videoEditor.stage.previewRaster')}
        value={props.rasterPreset}
        onChange={props.onRasterPresetChange}
        options={RASTER_OPTIONS}
      />
      <DisplayChoiceSection
        label={translate('videoEditor.stage.previewZoom')}
        value={props.zoom}
        onChange={props.onZoomChange}
        options={[
          { value: 'fit', label: translate('videoEditor.stage.previewZoomFit') },
          { value: '75%', label: '75%' },
          { value: '100%', label: '100%' },
        ]}
      />
    </ProductDropdownMenu>
  );
}
