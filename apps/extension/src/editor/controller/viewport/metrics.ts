import type { EditorViewportState } from '../../../features/editor/document/types';
import type { ViewportMetrics } from '../core/types';
import type { SourceState } from '../../document/model/source-state';
import { resolveEditorViewportScaleCompensation } from './scale';

export function getEditorStageInsets(
  stageElement: HTMLElement | null,
  viewportElement: HTMLElement | null,
  devicePixelRatioBaseline?: number
): { horizontal: number; vertical: number } {
  const target = stageElement ?? viewportElement;
  if (!target) {
    return { horizontal: 0, vertical: 0 };
  }

  const domScaleCompensation = resolveEditorViewportScaleCompensation(devicePixelRatioBaseline);
  const styles = window.getComputedStyle(target);
  const paddingLeft = (Number.parseFloat(styles.paddingLeft) || 0) / domScaleCompensation;
  const paddingRight = (Number.parseFloat(styles.paddingRight) || 0) / domScaleCompensation;
  const paddingTop = (Number.parseFloat(styles.paddingTop) || 0) / domScaleCompensation;
  const paddingBottom = (Number.parseFloat(styles.paddingBottom) || 0) / domScaleCompensation;

  return {
    horizontal: paddingLeft + paddingRight,
    vertical: paddingTop + paddingBottom,
  };
}

export function getEditorViewportMetrics(options: {
  viewportElement: HTMLElement | null;
  stageElement: HTMLElement | null;
  canvasDocumentSize: { width: number; height: number };
  zoomLevel: number;
  devicePixelRatioBaseline?: number;
}): ViewportMetrics {
  const domScaleCompensation = resolveEditorViewportScaleCompensation(
    options.devicePixelRatioBaseline
  );
  const viewportWidth = (options.viewportElement?.clientWidth ?? 0) / domScaleCompensation;
  const viewportHeight = (options.viewportElement?.clientHeight ?? 0) / domScaleCompensation;
  const scaledCanvasWidth = options.canvasDocumentSize.width * options.zoomLevel;
  const scaledCanvasHeight = options.canvasDocumentSize.height * options.zoomLevel;
  const stageInsets = getEditorStageInsets(
    options.stageElement,
    options.viewportElement,
    options.devicePixelRatioBaseline
  );
  const measuredContentWidth = (options.stageElement?.scrollWidth ?? 0) / domScaleCompensation;
  const measuredContentHeight = (options.stageElement?.scrollHeight ?? 0) / domScaleCompensation;
  const contentWidth = Math.max(
    viewportWidth,
    measuredContentWidth,
    scaledCanvasWidth + stageInsets.horizontal
  );
  const contentHeight = Math.max(
    viewportHeight,
    measuredContentHeight,
    scaledCanvasHeight + stageInsets.vertical
  );

  return {
    viewportWidth,
    viewportHeight,
    scrollLeft: (options.viewportElement?.scrollLeft ?? 0) / domScaleCompensation,
    scrollTop: (options.viewportElement?.scrollTop ?? 0) / domScaleCompensation,
    scaledCanvasWidth,
    scaledCanvasHeight,
    canvasOffsetLeft: Math.max(0, (contentWidth - scaledCanvasWidth) / 2),
    canvasOffsetTop: Math.max(0, (contentHeight - scaledCanvasHeight) / 2),
    domScaleCompensation,
  };
}

export function buildEditorViewportState(options: {
  viewportElement: HTMLElement | null;
  stageElement: HTMLElement | null;
  canvasDocumentSize: { width: number; height: number };
  zoomLevel: number;
  source: SourceState | null;
  devicePixelRatioBaseline?: number;
}): EditorViewportState {
  const metrics = getEditorViewportMetrics(options);
  const hasSource = Boolean(options.source);

  return {
    zoomPercent: Math.round(options.zoomLevel * 100),
    canvasWidth: hasSource ? options.canvasDocumentSize.width : 0,
    canvasHeight: hasSource ? options.canvasDocumentSize.height : 0,
    sourceWidth: options.source?.displayWidth ?? 0,
    sourceHeight: options.source?.displayHeight ?? 0,
    sourceName: options.source?.name ?? null,
    viewportWidth: metrics.viewportWidth,
    viewportHeight: metrics.viewportHeight,
    scrollLeft: hasSource ? metrics.scrollLeft : 0,
    scrollTop: hasSource ? metrics.scrollTop : 0,
    scaledCanvasWidth: hasSource ? metrics.scaledCanvasWidth : 0,
    scaledCanvasHeight: hasSource ? metrics.scaledCanvasHeight : 0,
    canvasOffsetLeft: hasSource ? metrics.canvasOffsetLeft : 0,
    canvasOffsetTop: hasSource ? metrics.canvasOffsetTop : 0,
  };
}
