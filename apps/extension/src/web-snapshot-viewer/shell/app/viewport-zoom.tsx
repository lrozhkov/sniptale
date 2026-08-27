import { useCallback, useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import { translate, type AppLocale } from '../../../platform/i18n';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 10) / 10));
}

function resolveFitZoom(availableWidth: number, contentWidth: number): number {
  if (availableWidth <= 0 || contentWidth <= 0) return 1;
  return Math.min(1, Math.max(MIN_ZOOM, availableWidth / contentWidth));
}

export function useViewerZoom(contentWidth: number | null) {
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(() => window.innerWidth);
  const [manualZoom, setManualZoom] = useState(1);
  const [fitToWidth, setFitToWidth] = useState(true);

  useEffect(() => {
    if (!surface) return undefined;
    const measure = () => setAvailableWidth(surface.clientWidth || window.innerWidth);
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    observer?.observe(surface);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [surface]);

  const fitZoom = contentWidth === null ? 1 : resolveFitZoom(availableWidth, contentWidth);
  const zoom = fitToWidth ? fitZoom : manualZoom;
  const setManualFrom = useCallback((next: number) => {
    setManualZoom(clampZoom(next));
    setFitToWidth(false);
  }, []);

  return useMemo(
    () => ({
      canZoom: contentWidth !== null,
      fitToWidth,
      onFitToWidth: () => setFitToWidth(true),
      onReset: () => setManualFrom(1),
      onZoomIn: () => setManualFrom(zoom + ZOOM_STEP),
      onZoomOut: () => setManualFrom(zoom - ZOOM_STEP),
      surfaceRef: setSurface,
      zoom,
    }),
    [contentWidth, fitToWidth, setManualFrom, zoom]
  );
}

export function WebSnapshotZoomControls(props: {
  canZoom: boolean;
  fitToWidth: boolean;
  locale: AppLocale;
  onFitToWidth: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoom: number;
}) {
  if (!props.canZoom) return null;
  const percent = `${Math.round(props.zoom * 100)}%`;
  const buttonClassName = [
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold',
    'text-[var(--sniptale-color-text-muted)] transition hover:bg-[var(--sniptale-color-surface-hover)]',
    'hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none',
    'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
  ].join(' ');

  return (
    <div
      role="group"
      aria-label={translate('webSnapshotViewer.app.zoomControls', props.locale)}
      className="flex shrink-0 items-center rounded-md border border-[var(--sniptale-color-border-soft)]"
    >
      <button
        type="button"
        aria-label={translate('webSnapshotViewer.app.zoomOut', props.locale)}
        className={buttonClassName}
        onClick={props.onZoomOut}
      >
        <Minus aria-hidden="true" size={14} />
      </button>
      <button
        type="button"
        aria-label={translate('webSnapshotViewer.app.actualSize', props.locale)}
        title={translate('webSnapshotViewer.app.actualSize', props.locale)}
        className={`${buttonClassName} min-w-14 border-x border-[var(--sniptale-color-border-soft)]`}
        onClick={props.onReset}
      >
        {percent}
      </button>
      <button
        type="button"
        aria-label={translate('webSnapshotViewer.app.zoomIn', props.locale)}
        className={buttonClassName}
        onClick={props.onZoomIn}
      >
        <Plus aria-hidden="true" size={14} />
      </button>
      <button
        type="button"
        aria-label={translate('webSnapshotViewer.app.fitToWidth', props.locale)}
        aria-pressed={props.fitToWidth}
        title={translate('webSnapshotViewer.app.fitToWidth', props.locale)}
        className={`${buttonClassName} border-l border-[var(--sniptale-color-border-soft)] ${
          props.fitToWidth ? 'bg-[var(--sniptale-color-surface-muted)]' : ''
        }`}
        onClick={props.onFitToWidth}
      >
        <Scan aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
