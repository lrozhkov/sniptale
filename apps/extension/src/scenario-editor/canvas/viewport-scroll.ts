import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface ScenarioCanvasViewportMetrics {
  clientHeight: number;
  clientWidth: number;
  frameHeight: number;
  frameOffsetLeft: number;
  frameOffsetTop: number;
  frameWidth: number;
  scale: number;
  scrollLeft: number;
  scrollTop: number;
}

export function useScenarioCanvasZoomAnchor(args: {
  scale: number;
  scaledFrameRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const previousMetricsRef = useRef<ScenarioCanvasViewportMetrics | null>(null);

  useLayoutEffect(() => {
    const viewport = args.viewportRef.current;
    const frame = args.scaledFrameRef.current;
    if (!viewport || !frame) {
      previousMetricsRef.current = null;
      return;
    }

    const previousMetrics = previousMetricsRef.current;
    if (previousMetrics && previousMetrics.scale !== args.scale) {
      restoreScenarioCanvasViewportCenter({ frame, previousMetrics, viewport });
    }

    previousMetricsRef.current = readScenarioCanvasViewportMetrics(viewport, frame, args.scale);
  }, [args.scale, args.scaledFrameRef, args.viewportRef]);
}

function readScenarioCanvasViewportMetrics(
  viewport: HTMLDivElement,
  frame: HTMLDivElement,
  scale: number
): ScenarioCanvasViewportMetrics {
  return {
    clientHeight: viewport.clientHeight,
    clientWidth: viewport.clientWidth,
    frameHeight: frame.offsetHeight,
    frameOffsetLeft: frame.offsetLeft,
    frameOffsetTop: frame.offsetTop,
    frameWidth: frame.offsetWidth,
    scale,
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
  };
}

function restoreScenarioCanvasViewportCenter(args: {
  frame: HTMLDivElement;
  previousMetrics: ScenarioCanvasViewportMetrics;
  viewport: HTMLDivElement;
}) {
  const relativeX =
    (args.previousMetrics.scrollLeft +
      args.previousMetrics.clientWidth / 2 -
      args.previousMetrics.frameOffsetLeft) /
    Math.max(1, args.previousMetrics.frameWidth);
  const relativeY =
    (args.previousMetrics.scrollTop +
      args.previousMetrics.clientHeight / 2 -
      args.previousMetrics.frameOffsetTop) /
    Math.max(1, args.previousMetrics.frameHeight);

  const maxScrollLeft = Math.max(0, args.viewport.scrollWidth - args.viewport.clientWidth);
  const maxScrollTop = Math.max(0, args.viewport.scrollHeight - args.viewport.clientHeight);
  args.viewport.scrollLeft = clamp(
    args.frame.offsetLeft +
      clamp(relativeX, 0, 1) * args.frame.offsetWidth -
      args.viewport.clientWidth / 2,
    0,
    maxScrollLeft
  );
  args.viewport.scrollTop = clamp(
    args.frame.offsetTop +
      clamp(relativeY, 0, 1) * args.frame.offsetHeight -
      args.viewport.clientHeight / 2,
    0,
    maxScrollTop
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
