import { applyContentRuntimeTheme } from '../../platform/page-context/dom';
import type { RegionBounds } from './helpers';

type RecordingOverlayMetrics = {
  cssHeight: number;
  cssWidth: number;
  cssX: number;
  cssY: number;
  indicatorTop: number;
};

const regionSelectorRootStyle = `
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  isolation: isolate;
  z-index: 2147483646;
`;

const recordingOverlayRootStyle = `
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2147483645;
  pointer-events: none;
`;

export function getRegionSelectorRootStyle(): string {
  return regionSelectorRootStyle;
}

export function getRecordingOverlayRootStyle(): string {
  return recordingOverlayRootStyle;
}

export function getRecordingOverlayMetrics(
  region: RegionBounds,
  dpr = window.devicePixelRatio || 1
): RecordingOverlayMetrics {
  const cssX = region.x / dpr;
  const cssY = region.y / dpr;
  const cssWidth = region.width / dpr;
  const cssHeight = region.height / dpr;

  return {
    cssHeight,
    cssWidth,
    cssX,
    cssY,
    indicatorTop: Math.max(8, cssY - 30),
  };
}

export function applyRegionSelectorTheme(container: HTMLElement): void {
  applyContentRuntimeTheme(container);
}
