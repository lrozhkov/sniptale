import { applyContentRuntimeTheme } from '../../platform/page-context/dom';
import type { RegionBounds } from './helpers';

type RecordingOverlayMetrics = {
  cssHeight: number;
  cssWidth: number;
  cssX: number;
  cssY: number;
  indicatorTop: number | null;
};

const RECORDING_INDICATOR_HEIGHT = 30;
const RECORDING_INDICATOR_GAP = 8;

function resolveRecordingIndicatorTop(region: RegionBounds): number | null {
  if (region.y >= RECORDING_INDICATOR_HEIGHT + RECORDING_INDICATOR_GAP) {
    return region.y - RECORDING_INDICATOR_HEIGHT;
  }
  const below = region.y + region.height + RECORDING_INDICATOR_GAP;
  return below + RECORDING_INDICATOR_HEIGHT <= window.innerHeight ? below : null;
}

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

export function getRecordingOverlayMetrics(region: RegionBounds): RecordingOverlayMetrics {
  const cssX = region.x;
  const cssY = region.y;
  const cssWidth = region.width;
  const cssHeight = region.height;

  return {
    cssHeight,
    cssWidth,
    cssX,
    cssY,
    indicatorTop: resolveRecordingIndicatorTop(region),
  };
}

export function applyRegionSelectorTheme(container: HTMLElement): void {
  applyContentRuntimeTheme(container);
}
