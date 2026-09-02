import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import { translate, type AppLocale } from '../../../platform/i18n';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const FIT_ACTUAL_SIZE_THRESHOLD = 0.99;
const OVERFLOW_ROUNDING_TOLERANCE = 1;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 10) / 10));
}

function resolveFitZoom(availableWidth: number, contentWidth: number): number {
  if (availableWidth <= 0 || contentWidth <= 0) return 1;
  const ratio = availableWidth / contentWidth;
  if (ratio >= FIT_ACTUAL_SIZE_THRESHOLD) return 1;
  return Math.max(MIN_ZOOM, ratio);
}

function isInteractivePointerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      'a, button, input, select, textarea, [role="button"], [contenteditable="true"]'
    ) !== null
  );
}

export function useViewerZoom(contentWidth: number | null, responsiveLayout = false) {
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(() => window.innerWidth);
  const [outerWidth, setOuterWidth] = useState(() => window.innerWidth);
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
      const nextAvailableWidth = surface.clientWidth || window.innerWidth;
      setAvailableWidth(nextAvailableWidth);
      setOuterWidth(surface.offsetWidth || nextAvailableWidth);
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

  const fitZoom =
    responsiveLayout || contentWidth === null ? 1 : resolveFitZoom(availableWidth, contentWidth);
  const zoom = fitToWidth ? fitZoom : manualZoom;
  const scaledContentWidth =
    contentWidth === null ? null : responsiveLayout ? availableWidth : contentWidth * zoom;
  const scrollbarGutterWidth = Math.max(0, outerWidth - availableWidth);
  const meaningfulHorizontalOverflow =
    scaledContentWidth !== null &&
    Math.ceil(scaledContentWidth) >
      Math.floor(availableWidth + scrollbarGutterWidth + OVERFLOW_ROUNDING_TOLERANCE);
  const suppressScrollbarGutterOverflow =
    scaledContentWidth !== null &&
    scaledContentWidth > availableWidth &&
    !meaningfulHorizontalOverflow;
  const setManualFrom = useCallback((next: number) => {
    setManualZoom(clampZoom(next));
    setFitToWidth(false);
  }, []);

  return useMemo(
    () => ({
      canFitToWidth: !responsiveLayout,
      canZoom: contentWidth !== null,
      availableHeight,
      availableWidth,
      grabClassName: meaningfulHorizontalOverflow
        ? responsiveLayout
          ? ''
          : isDragging
            ? 'cursor-grabbing'
            : 'cursor-grab'
        : '',
      horizontalOverflowClassName:
        responsiveLayout || suppressScrollbarGutterOverflow
          ? 'overflow-x-hidden'
          : 'overflow-x-auto',
      fitToWidth,
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        const target = event.currentTarget;
        if (
          event.button !== 0 ||
          isInteractivePointerTarget(event.target) ||
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
    [
      availableHeight,
      availableWidth,
      contentWidth,
      fitToWidth,
      isDragging,
      meaningfulHorizontalOverflow,
      responsiveLayout,
      setManualFrom,
      suppressScrollbarGutterOverflow,
      zoom,
    ]
  );
}

export interface ViewerZoomControls {
  canFitToWidth: boolean;
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
      {props.canFitToWidth ? (
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
      ) : null}
    </div>
  );
}
