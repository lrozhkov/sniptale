import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import { translate, type AppLocale } from '../../../platform/i18n';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const FIT_ACTUAL_SIZE_THRESHOLD = 0.99;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 10) / 10));
}

function resolveFitZoom(availableWidth: number, contentWidth: number): number {
  if (availableWidth <= 0 || contentWidth <= 0) return 1;
  const ratio = availableWidth / contentWidth;
  if (ratio >= FIT_ACTUAL_SIZE_THRESHOLD) return 1;
  return Math.max(MIN_ZOOM, ratio);
}

export function useViewerZoom(contentWidth: number | null) {
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(() => window.innerWidth);
  const [availableHeight, setAvailableHeight] = useState(() => window.innerHeight);
  const [manualZoom, setManualZoom] = useState(1);
  const [fitToWidth, setFitToWidth] = useState(true);
  const dragOriginRef = useRef<{
    clientX: number;
    clientY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!surface) return undefined;
    const measure = () => {
      setAvailableWidth(surface.clientWidth || window.innerWidth);
      setAvailableHeight(surface.clientHeight || window.innerHeight);
    };
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
  const canGrab =
    contentWidth !== null && Math.ceil(contentWidth * zoom) > Math.floor(availableWidth);
  const setManualFrom = useCallback((next: number) => {
    setManualZoom(clampZoom(next));
    setFitToWidth(false);
  }, []);

  return useMemo(
    () => ({
      canZoom: contentWidth !== null,
      availableHeight,
      grabClassName: canGrab ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : '',
      fitToWidth,
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        const target = event.currentTarget;
        if (
          event.button !== 0 ||
          (target.scrollWidth <= target.clientWidth && target.scrollHeight <= target.clientHeight)
        ) {
          return;
        }
        dragOriginRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
          scrollLeft: target.scrollLeft,
          scrollTop: target.scrollTop,
        };
        target.setPointerCapture?.(event.pointerId);
        setIsDragging(true);
        event.preventDefault();
      },
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        const origin = dragOriginRef.current;
        if (!origin) return;
        event.currentTarget.scrollLeft = origin.scrollLeft + origin.clientX - event.clientX;
        event.currentTarget.scrollTop = origin.scrollTop + origin.clientY - event.clientY;
      },
      onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
        if (!dragOriginRef.current) return;
        dragOriginRef.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        setIsDragging(false);
      },
      onFitToWidth: () => setFitToWidth(true),
      onReset: () => setManualFrom(1),
      onZoomIn: () => setManualFrom(zoom + ZOOM_STEP),
      onZoomOut: () => setManualFrom(zoom - ZOOM_STEP),
      surfaceRef: setSurface,
      zoom,
    }),
    [availableHeight, canGrab, contentWidth, fitToWidth, isDragging, setManualFrom, zoom]
  );
}

export interface ViewerZoomControls {
  canZoom: boolean;
  fitToWidth: boolean;
  onFitToWidth: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoom: number;
}

export function WebSnapshotZoomControls(props: ViewerZoomControls & { locale: AppLocale }) {
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
