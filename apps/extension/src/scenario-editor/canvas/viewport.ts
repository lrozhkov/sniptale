import {
  createCanvasFrameFromPoints,
  doesCanvasFrameIntersect,
  getCanvasPointFromClient,
} from '@sniptale/runtime-contracts/canvas-interactions';
import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';

export const SCENARIO_CANVAS_GRID_SIZE = 32;
const SCENARIO_CANVAS_MAX_ZOOM = 4;
const SCENARIO_CANVAS_MIN_ZOOM = 0.2;
const SCENARIO_CANVAS_ZOOM_STEP = 0.1;

type ScenarioCanvasZoomDirection = 'in' | 'out';

export interface ScenarioCanvasViewportSize {
  height: number;
  width: number;
}

export interface ScenarioCanvasViewportInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface ScenarioCanvasPoint {
  x: number;
  y: number;
}

export function resolveScenarioCanvasFitScale(args: {
  canvas: ScenarioCanvasViewportSize;
  insets?: ScenarioCanvasViewportInsets | undefined;
  padding: number;
  viewport: ScenarioCanvasViewportSize;
}): number {
  const insets = args.insets ?? { bottom: 0, left: 0, right: 0, top: 0 };
  const availableWidth = Math.max(
    1,
    args.viewport.width - insets.left - insets.right - args.padding * 2
  );
  const availableHeight = Math.max(
    1,
    args.viewport.height - insets.top - insets.bottom - args.padding * 2
  );
  const widthScale = availableWidth / Math.max(1, args.canvas.width);
  const heightScale = availableHeight / Math.max(1, args.canvas.height);

  return clampScenarioCanvasZoom(Math.min(widthScale, heightScale));
}

function clampScenarioCanvasZoom(zoom: number): number {
  return Math.min(
    SCENARIO_CANVAS_MAX_ZOOM,
    Math.max(SCENARIO_CANVAS_MIN_ZOOM, roundScenarioCanvasZoom(zoom))
  );
}

export function stepScenarioCanvasZoom(
  zoom: number,
  direction: ScenarioCanvasZoomDirection
): number {
  const delta = direction === 'in' ? SCENARIO_CANVAS_ZOOM_STEP : -SCENARIO_CANVAS_ZOOM_STEP;
  return clampScenarioCanvasZoom(zoom + delta);
}

export function roundScenarioCanvasZoom(zoom: number): number {
  return Number(zoom.toFixed(2));
}

export function getScenarioCanvasPointFromClient(args: {
  clientX: number;
  clientY: number;
  scale: number;
  stageRect: Pick<DOMRect, 'left' | 'top'>;
}): ScenarioCanvasPoint {
  return getCanvasPointFromClient(args);
}

export function createScenarioCanvasMarqueeFrame(
  origin: ScenarioCanvasPoint,
  current: ScenarioCanvasPoint
): ScenarioElementFrame {
  return createCanvasFrameFromPoints(origin, current);
}

export function doesScenarioFrameIntersect(
  first: ScenarioElementFrame,
  second: ScenarioElementFrame
): boolean {
  return doesCanvasFrameIntersect(first, second);
}
