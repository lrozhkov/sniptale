import { calculateFrameContainerCoords, createFrameCalcSettings } from '../frame-runtime/coords';
import { getAbsolutePosition } from '../../platform/frame';

const QUICK_EDIT_FRAME_SETTINGS = createFrameCalcSettings(null);
export const EDITABLE_BORDER = `${QUICK_EDIT_FRAME_SETTINGS.borderWidth}px solid var(--sniptale-color-info)`;

export function applyQuickEditFrameRect(frameElement: HTMLElement, element: HTMLElement): void {
  const frameCoords = calculateFrameContainerCoords(
    getAbsolutePosition(element),
    QUICK_EDIT_FRAME_SETTINGS
  );

  frameElement.style.top = `${frameCoords.y}px`;
  frameElement.style.left = `${frameCoords.x}px`;
  frameElement.style.width = `${frameCoords.width}px`;
  frameElement.style.height = `${frameCoords.height}px`;
}
