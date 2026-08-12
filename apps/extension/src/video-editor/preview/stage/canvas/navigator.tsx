import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { translate } from '../../../../platform/i18n';
import { startWindowPointerSession } from '../../../interaction/pointer-session';

const NAVIGATOR_MAX_WIDTH = 144;
const NAVIGATOR_MAX_HEIGHT = 90;

interface PreviewNavigatorMetrics {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
}

interface PreviewNavigatorGeometry {
  height: number;
  viewportHeight: number;
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
  width: number;
}

export function createPreviewNavigatorGeometry(
  metrics: PreviewNavigatorMetrics
): PreviewNavigatorGeometry | null {
  const hasOverflow =
    metrics.scrollWidth > metrics.clientWidth + 1 ||
    metrics.scrollHeight > metrics.clientHeight + 1;
  if (!hasOverflow || metrics.scrollWidth <= 0 || metrics.scrollHeight <= 0) {
    return null;
  }

  const scale = Math.min(
    NAVIGATOR_MAX_WIDTH / metrics.scrollWidth,
    NAVIGATOR_MAX_HEIGHT / metrics.scrollHeight
  );
  return {
    height: metrics.scrollHeight * scale,
    viewportHeight: Math.min(metrics.scrollHeight, metrics.clientHeight) * scale,
    viewportLeft: metrics.scrollLeft * scale,
    viewportTop: metrics.scrollTop * scale,
    viewportWidth: Math.min(metrics.scrollWidth, metrics.clientWidth) * scale,
    width: metrics.scrollWidth * scale,
  };
}

export function resolvePreviewNavigatorScrollTarget(params: {
  clientX: number;
  clientY: number;
  metrics: PreviewNavigatorMetrics;
  navigatorRect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;
}): { left: number; top: number } {
  const { metrics, navigatorRect } = params;
  const contentX =
    ((params.clientX - navigatorRect.left) / Math.max(1, navigatorRect.width)) *
    metrics.scrollWidth;
  const contentY =
    ((params.clientY - navigatorRect.top) / Math.max(1, navigatorRect.height)) *
    metrics.scrollHeight;
  return {
    left: clamp(contentX - metrics.clientWidth / 2, 0, metrics.scrollWidth - metrics.clientWidth),
    top: clamp(contentY - metrics.clientHeight / 2, 0, metrics.scrollHeight - metrics.clientHeight),
  };
}

export function PreviewStageZoomNavigator(props: {
  contentRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const [metrics, setMetrics] = useState<PreviewNavigatorMetrics | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const thumbnailRef = useRef<HTMLCanvasElement | null>(null);
  usePreviewNavigatorMetrics(props, setMetrics);

  useEffect(() => () => cleanupRef.current?.(), []);

  const navigate = useCallback(
    (clientX: number, clientY: number, navigatorRect: DOMRect) => {
      const viewport = props.viewportRef.current;
      if (!viewport || !metrics) return;
      const target = resolvePreviewNavigatorScrollTarget({
        clientX,
        clientY,
        metrics,
        navigatorRect,
      });
      viewport.scrollTo(target);
    },
    [metrics, props.viewportRef]
  );

  const geometry = metrics ? createPreviewNavigatorGeometry(metrics) : null;
  usePreviewNavigatorThumbnail(props.contentRef, thumbnailRef, geometry);
  if (!geometry) return null;

  return (
    <button
      type="button"
      aria-label={translate('videoEditor.stage.previewNavigator')}
      className={[
        'absolute bottom-3 right-3 z-20 overflow-hidden rounded-[8px] border p-0 shadow-md',
        'border-[color:var(--sniptale-color-border-strong)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_92%,transparent)]',
        'focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
      ].join(' ')}
      data-ui="video.preview.navigator"
      style={{ height: geometry.height, width: geometry.width }}
      onKeyDown={(event) => handleNavigatorKeyDown(event, props.viewportRef)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const navigatorRect = event.currentTarget.getBoundingClientRect();
        navigate(event.clientX, event.clientY, navigatorRect);
        cleanupRef.current?.();
        cleanupRef.current = startWindowPointerSession({
          onMove: (moveEvent) => navigate(moveEvent.clientX, moveEvent.clientY, navigatorRect),
          onEnd: () => {
            cleanupRef.current = null;
          },
        });
      }}
    >
      <span className="absolute inset-1 rounded-[5px] bg-[color:var(--sniptale-color-surface-canvas)] opacity-70" />
      <canvas
        ref={thumbnailRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full opacity-80"
        data-ui="video.preview.navigator.overview"
        height={Math.max(1, Math.ceil(geometry.height))}
        width={Math.max(1, Math.ceil(geometry.width))}
      />
      <span
        className={[
          'absolute rounded-[4px] border',
          'border-[color:var(--sniptale-color-accent-emphasis)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-emphasis)_20%,transparent)]',
        ].join(' ')}
        data-ui="video.preview.navigator.viewport"
        style={{
          height: geometry.viewportHeight,
          left: geometry.viewportLeft,
          top: geometry.viewportTop,
          width: geometry.viewportWidth,
        }}
      />
    </button>
  );
}

function usePreviewNavigatorThumbnail(
  contentRef: RefObject<HTMLDivElement | null>,
  thumbnailRef: RefObject<HTMLCanvasElement | null>,
  geometry: PreviewNavigatorGeometry | null
): void {
  useEffect(() => {
    if (!geometry) return;
    const draw = () => {
      const source = contentRef.current?.querySelector<HTMLCanvasElement>(
        '[data-preview-stage-canvas]'
      );
      const thumbnail = thumbnailRef.current;
      if (!source || !thumbnail || source.width <= 0 || source.height <= 0) return;
      const context = thumbnail.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, thumbnail.width, thumbnail.height);
      context.drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
    };
    draw();
    const interval = window.setInterval(draw, 250);
    return () => window.clearInterval(interval);
  }, [contentRef, geometry, thumbnailRef]);
}

function usePreviewNavigatorMetrics(
  props: {
    contentRef: RefObject<HTMLDivElement | null>;
    viewportRef: RefObject<HTMLDivElement | null>;
  },
  setMetrics: (metrics: PreviewNavigatorMetrics) => void
) {
  useEffect(() => {
    const viewport = props.viewportRef.current;
    const content = props.contentRef.current;
    if (!viewport || !content) return;

    const update = () => setMetrics(readPreviewNavigatorMetrics(viewport));
    update();
    viewport.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => update());
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(content);
    return () => {
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      resizeObserver?.disconnect();
    };
  }, [props.contentRef, props.viewportRef, setMetrics]);
}

function readPreviewNavigatorMetrics(viewport: HTMLDivElement): PreviewNavigatorMetrics {
  return {
    clientHeight: viewport.clientHeight,
    clientWidth: viewport.clientWidth,
    scrollHeight: viewport.scrollHeight,
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
    scrollWidth: viewport.scrollWidth,
  };
}

function handleNavigatorKeyDown(
  event: React.KeyboardEvent,
  viewportRef: RefObject<HTMLDivElement | null>
) {
  const viewport = viewportRef.current;
  if (!viewport) return;
  const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
  const vertical = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
  if (horizontal === 0 && vertical === 0) return;
  event.preventDefault();
  viewport.scrollTo({
    left: viewport.scrollLeft + horizontal * Math.max(40, viewport.clientWidth * 0.2),
    top: viewport.scrollTop + vertical * Math.max(40, viewport.clientHeight * 0.2),
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
