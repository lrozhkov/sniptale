import type { Canvas } from 'fabric';

export type CanvasSize = {
  width: number;
  height: number;
};

export interface ZoomContext {
  canvas: Canvas | null;
  viewportElement: HTMLElement | null;
  stageElement: HTMLElement | null;
  canvasDocumentSize: CanvasSize;
  zoomLevel: number;
  devicePixelRatioBaseline?: number;
  syncViewportState: () => void;
  syncRuntimeState: () => void;
}

export function getDevicePixelRatioBaselineOptions(devicePixelRatioBaseline?: number) {
  return devicePixelRatioBaseline === undefined ? {} : { devicePixelRatioBaseline };
}
