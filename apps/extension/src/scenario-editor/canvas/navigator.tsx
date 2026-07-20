import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, RefObject } from 'react';
import { translate } from '../../platform/i18n';
import type { ScenarioSlideRenderResult } from '../project/stage-render/slide';

const NAVIGATOR_MAX_WIDTH = 168;
const NAVIGATOR_MAX_HEIGHT = 104;

interface ScenarioCanvasNavigatorMetrics {
  frameHeight: number;
  frameOffsetLeft: number;
  frameOffsetTop: number;
  frameWidth: number;
  scrollLeft: number;
  scrollTop: number;
  viewportHeight: number;
  viewportWidth: number;
}

export function ScenarioCanvasNavigator(props: {
  rendered: ScenarioSlideRenderResult;
  scaledFrameRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const { rendered, scaledFrameRef, viewportRef } = props;
  const [metrics, setMetrics] = useState<ScenarioCanvasNavigatorMetrics | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const previewSize = useScenarioNavigatorPreviewSize(rendered.canvas);
  const syncMetrics = useScenarioCanvasNavigatorMetrics({
    scaledFrameRef,
    setMetrics,
    viewportRef,
  });

  const viewportFrame = metrics
    ? createScenarioCanvasNavigatorFrameStyle(metrics, previewSize)
    : null;

  return (
    <div
      data-ui="scenario.canvas.navigator"
      className="pointer-events-auto absolute right-4 top-4 z-30 rounded-[8px] border
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)] p-2
        shadow-[0_12px_32px_rgba(15,23,42,0.14)]"
    >
      <ScenarioCanvasNavigatorPreview
        dragPointerIdRef={dragPointerIdRef}
        previewSize={previewSize}
        renderedSvg={rendered.svg}
        scaledFrameRef={scaledFrameRef}
        syncMetrics={syncMetrics}
        viewportFrame={viewportFrame}
        viewportRef={viewportRef}
      />
    </div>
  );
}

function useScenarioCanvasNavigatorMetrics(args: {
  scaledFrameRef: RefObject<HTMLDivElement | null>;
  setMetrics: (metrics: ScenarioCanvasNavigatorMetrics | null) => void;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const { scaledFrameRef, setMetrics, viewportRef } = args;
  const syncMetrics = useCallback(() => {
    setMetrics(readScenarioCanvasNavigatorMetrics({ scaledFrameRef, viewportRef }));
  }, [scaledFrameRef, setMetrics, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    syncMetrics();
    if (!viewport) return undefined;
    viewport.addEventListener('scroll', syncMetrics, { passive: true });
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncMetrics);
      return () => removeScenarioNavigatorFallbackListeners(viewport, syncMetrics);
    }
    const observer = new ResizeObserver(syncMetrics);
    observer.observe(viewport);
    if (scaledFrameRef.current) observer.observe(scaledFrameRef.current);
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', syncMetrics);
    };
  }, [scaledFrameRef, syncMetrics, viewportRef]);

  return syncMetrics;
}

function removeScenarioNavigatorFallbackListeners(
  viewport: HTMLDivElement,
  syncMetrics: () => void
) {
  viewport.removeEventListener('scroll', syncMetrics);
  window.removeEventListener('resize', syncMetrics);
}

function ScenarioCanvasNavigatorPreview(props: {
  dragPointerIdRef: RefObject<number | null>;
  previewSize: CSSProperties;
  renderedSvg: string;
  scaledFrameRef: RefObject<HTMLDivElement | null>;
  syncMetrics: () => void;
  viewportFrame: CSSProperties | null;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const navigateFromPointer = createScenarioNavigatorPointerHandler(props);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={translate('scenario.editor.navigator')}
      className="relative touch-none overflow-hidden rounded-[6px] border
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)]
        outline-none focus-visible:ring-2
        focus-visible:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_52%,transparent)]"
      style={props.previewSize}
      onPointerDown={(event) => {
        props.dragPointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        navigateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (props.dragPointerIdRef.current === event.pointerId) navigateFromPointer(event);
      }}
      onPointerUp={(event) => releaseScenarioNavigatorDrag(props.dragPointerIdRef, event)}
      onPointerCancel={(event) => releaseScenarioNavigatorDrag(props.dragPointerIdRef, event)}
    >
      <ScenarioNavigatorPreviewImage renderedSvg={props.renderedSvg} />
      <ScenarioNavigatorViewportFrame viewportFrame={props.viewportFrame} />
    </div>
  );
}

function createScenarioNavigatorPointerHandler(props: {
  scaledFrameRef: RefObject<HTMLDivElement | null>;
  syncMetrics: () => void;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  return (event: PointerEvent<HTMLDivElement>) => {
    const viewport = props.viewportRef.current;
    const metrics = readScenarioCanvasNavigatorMetrics(props);
    if (!viewport || !metrics) return;
    const rect = event.currentTarget.getBoundingClientRect();
    navigateScenarioCanvasViewport({
      metrics,
      relativeX: (event.clientX - rect.left) / Math.max(1, rect.width),
      relativeY: (event.clientY - rect.top) / Math.max(1, rect.height),
      viewport,
    });
    props.syncMetrics();
  };
}

function releaseScenarioNavigatorDrag(
  dragPointerIdRef: RefObject<number | null>,
  event: PointerEvent<HTMLDivElement>
) {
  dragPointerIdRef.current = null;
  releaseScenarioNavigatorPointer(event);
}

function ScenarioNavigatorPreviewImage(props: { renderedSvg: string }) {
  return (
    <img
      alt=""
      className="absolute inset-0 h-full w-full"
      draggable={false}
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(props.renderedSvg)}`}
    />
  );
}

function ScenarioNavigatorViewportFrame(props: { viewportFrame: CSSProperties | null }) {
  if (!props.viewportFrame) {
    return null;
  }
  return (
    <div
      className="pointer-events-none absolute rounded-[5px] border
        border-[var(--sniptale-color-border-accent-strong)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]"
      style={props.viewportFrame}
    />
  );
}

function releaseScenarioNavigatorPointer(event: PointerEvent<HTMLDivElement>) {
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

function useScenarioNavigatorPreviewSize(canvas: { height: number; width: number }) {
  return useMemo(() => {
    const widthRatio = NAVIGATOR_MAX_WIDTH / Math.max(1, canvas.width);
    const heightRatio = NAVIGATOR_MAX_HEIGHT / Math.max(1, canvas.height);
    const scale = Math.min(widthRatio, heightRatio);
    return {
      height: Math.max(1, Math.round(canvas.height * scale)),
      width: Math.max(1, Math.round(canvas.width * scale)),
    };
  }, [canvas.height, canvas.width]);
}

export function readScenarioCanvasNavigatorMetrics(args: {
  scaledFrameRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
}): ScenarioCanvasNavigatorMetrics | null {
  const viewport = args.viewportRef.current;
  const frame = args.scaledFrameRef.current;
  if (!viewport || !frame) {
    return null;
  }

  return {
    frameHeight: frame.offsetHeight,
    frameOffsetLeft: frame.offsetLeft,
    frameOffsetTop: frame.offsetTop,
    frameWidth: frame.offsetWidth,
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
    viewportHeight: viewport.clientHeight,
    viewportWidth: viewport.clientWidth,
  };
}

export function createScenarioCanvasNavigatorFrameStyle(
  metrics: ScenarioCanvasNavigatorMetrics,
  previewSize: { height: number; width: number }
): CSSProperties | null {
  if (metrics.frameWidth <= 0 || metrics.frameHeight <= 0) {
    return null;
  }

  const visibleLeft = clamp(metrics.scrollLeft - metrics.frameOffsetLeft, 0, metrics.frameWidth);
  const visibleTop = clamp(metrics.scrollTop - metrics.frameOffsetTop, 0, metrics.frameHeight);
  const visibleRight = clamp(
    metrics.scrollLeft + metrics.viewportWidth - metrics.frameOffsetLeft,
    0,
    metrics.frameWidth
  );
  const visibleBottom = clamp(
    metrics.scrollTop + metrics.viewportHeight - metrics.frameOffsetTop,
    0,
    metrics.frameHeight
  );

  return {
    height: `${Math.max(4, ((visibleBottom - visibleTop) / metrics.frameHeight) * previewSize.height)}px`,
    left: `${(visibleLeft / metrics.frameWidth) * previewSize.width}px`,
    top: `${(visibleTop / metrics.frameHeight) * previewSize.height}px`,
    width: `${Math.max(4, ((visibleRight - visibleLeft) / metrics.frameWidth) * previewSize.width)}px`,
  };
}

export function navigateScenarioCanvasViewport(args: {
  metrics: ScenarioCanvasNavigatorMetrics;
  relativeX: number;
  relativeY: number;
  viewport: HTMLDivElement;
}) {
  const maxScrollLeft = Math.max(0, args.viewport.scrollWidth - args.metrics.viewportWidth);
  const maxScrollTop = Math.max(0, args.viewport.scrollHeight - args.metrics.viewportHeight);
  args.viewport.scrollLeft = clamp(
    args.metrics.frameOffsetLeft +
      clamp(args.relativeX, 0, 1) * args.metrics.frameWidth -
      args.metrics.viewportWidth / 2,
    0,
    maxScrollLeft
  );
  args.viewport.scrollTop = clamp(
    args.metrics.frameOffsetTop +
      clamp(args.relativeY, 0, 1) * args.metrics.frameHeight -
      args.metrics.viewportHeight / 2,
    0,
    maxScrollTop
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
