import type { BorderPreset, FrameData } from '../../../../features/highlighter/contracts';
import { getAbsolutePosition } from '../../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  calculateFrameContainerCoords,
  createFrameCalcSettings,
  type ElementAbsolutePosition,
} from '../coords';
import { getFrameIframeDiagnostics } from '../diagnostics/iframe';

const logger = createLogger({ namespace: 'ContentFrameIframeDiag' });

type FrameOffset = NonNullable<FrameData['offset']>;

function getElementViewportPosition(element: HTMLElement): ElementAbsolutePosition {
  return getAbsolutePosition(element);
}

export function calculateFrameViewportCoords(
  element: HTMLElement,
  borderSettings?: BorderPreset
): Pick<FrameData, 'x' | 'y' | 'width' | 'height'> {
  const coords = calculateFrameContainerCoords(
    getElementViewportPosition(element),
    createFrameCalcSettings(borderSettings)
  );

  return {
    x: coords.x,
    y: coords.y,
    width: coords.width,
    height: coords.height,
  };
}

export function createFrameDataFromElement(
  frameId: string,
  element: HTMLElement,
  borderSettings?: BorderPreset
): FrameData {
  const frameCoords = calculateFrameViewportCoords(element, borderSettings);
  const diagnostics = getFrameIframeDiagnostics(element);
  if (diagnostics) {
    logger.log('createFrameDataFromElement', {
      frameId,
      ...diagnostics,
      frameCoords,
    });
  }

  return {
    id: frameId,
    ...frameCoords,
    linkedElement: element,
  };
}

export function calculateFrameOffsetFromElement(
  frame: Pick<FrameData, 'x' | 'y' | 'width' | 'height'>,
  element: HTMLElement
): FrameOffset {
  const rect = getAbsolutePosition(element);
  return {
    x: frame.x - rect.x,
    y: frame.y - rect.y,
    width: frame.width - rect.width,
    height: frame.height - rect.height,
  };
}

export function applyFrameOffsetToElement(
  element: HTMLElement,
  offset: FrameOffset
): Pick<FrameData, 'x' | 'y' | 'width' | 'height'> {
  const rect = getAbsolutePosition(element);
  return {
    x: rect.x + offset.x,
    y: rect.y + offset.y,
    width: rect.width + offset.width,
    height: rect.height + offset.height,
  };
}
