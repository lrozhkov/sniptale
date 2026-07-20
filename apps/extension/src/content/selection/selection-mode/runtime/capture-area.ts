import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';

export function buildSelectionCaptureArea(selection: CaptureArea): CaptureArea {
  return {
    x: Math.round(selection.x),
    y: Math.round(selection.y),
    width: Math.round(selection.width),
    height: Math.round(selection.height),
  };
}
