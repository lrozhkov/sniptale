import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { createAnnotationArrow, createAnnotationPath, createAnnotationRectangle } from './svg';

interface VideoAnnotationPoint {
  x: number;
  y: number;
}

export interface VideoAnnotationPathState {
  getPoints: (element: SVGPathElement) => VideoAnnotationPoint[] | undefined;
  setPoints: (element: SVGPathElement, points: VideoAnnotationPoint[]) => void;
}

interface VideoAnnotationRuntimeDeps {
  pathState?: VideoAnnotationPathState;
  scheduleTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
}

export function applyVideoAnnotationAutoFade(
  element: SVGElement,
  settings: VideoRecordingSettings | null,
  deps: VideoAnnotationRuntimeDeps = {}
): void {
  if (!settings) {
    return;
  }

  const delayMs = settings.autoFadeDelay * 1000;
  const fadeDurationMs = 1000;
  const scheduleTimeout = deps.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis);
  element.style.transition = `opacity ${fadeDurationMs}ms ease-out`;

  scheduleTimeout(() => {
    element.style.opacity = '0';
    scheduleTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }, fadeDurationMs);
  }, delayMs);
}

export function createAnnotationElement(
  modifiers: { hasShift: boolean; hasAlt: boolean; hasCtrl: boolean },
  start: { x: number; y: number },
  deps: VideoAnnotationRuntimeDeps = {}
): SVGElement | null {
  if (modifiers.hasShift) {
    return createAnnotationRectangle(start.x, start.y, 0, 0);
  }
  if (modifiers.hasAlt) {
    return createAnnotationArrow(start.x, start.y, start.x, start.y);
  }
  if (modifiers.hasCtrl) {
    const points = [
      { x: start.x, y: start.y },
      { x: start.x, y: start.y },
    ];
    const path = createAnnotationPath(points);
    deps.pathState?.setPoints(path, points);
    return path;
  }

  return null;
}

export function updateAnnotationElement(
  currentElement: SVGElement,
  svgContainer: SVGSVGElement,
  start: { x: number; y: number },
  current: { x: number; y: number },
  deps: VideoAnnotationRuntimeDeps = {}
): SVGElement {
  if (currentElement.tagName === 'rect') {
    currentElement.setAttribute('x', Math.min(start.x, current.x).toString());
    currentElement.setAttribute('y', Math.min(start.y, current.y).toString());
    currentElement.setAttribute('width', Math.abs(current.x - start.x).toString());
    currentElement.setAttribute('height', Math.abs(current.y - start.y).toString());
    return currentElement;
  }

  if (currentElement.tagName === 'line') {
    currentElement.setAttribute('x2', current.x.toString());
    currentElement.setAttribute('y2', current.y.toString());
    return currentElement;
  }

  const pathElement = currentElement as SVGPathElement;
  const points = deps.pathState?.getPoints(pathElement)?.slice() ?? [
    { x: start.x, y: start.y },
    { x: start.x, y: start.y },
  ];
  points.push({ x: current.x, y: current.y });
  const nextPath = createAnnotationPath(points);
  deps.pathState?.setPoints(nextPath, points);
  svgContainer.replaceChild(nextPath, currentElement);
  return nextPath;
}
