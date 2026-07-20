import type { FabricObject } from 'fabric';

import { DEFAULT_EDITOR_TEXTBOX_WIDTH } from '../../../objects/annotation/text';

import type { SourceState } from '../../../document/model/source-state';

function getObjectDimension(
  object: FabricObject,
  axis: 'width' | 'height',
  fallback: number
): number {
  const measure =
    axis === 'width'
      ? (object as { getScaledWidth?: () => number }).getScaledWidth?.()
      : (object as { getScaledHeight?: () => number }).getScaledHeight?.();
  if (typeof measure === 'number' && Number.isFinite(measure) && measure > 0) {
    return measure;
  }
  const rawSize = object[axis];
  return typeof rawSize === 'number' && Number.isFinite(rawSize) && rawSize > 0
    ? rawSize
    : fallback;
}

export function clampTechnicalDataTextPosition(text: FabricObject, source: SourceState): void {
  const inset = 20;
  const textWidth = getObjectDimension(text, 'width', DEFAULT_EDITOR_TEXTBOX_WIDTH);
  const textHeight = getObjectDimension(text, 'height', 120);
  const minLeft = source.left + inset;
  const maxLeft = Math.max(minLeft, source.left + source.displayWidth - textWidth - inset);
  const minTop = source.top + inset;
  const maxTop = Math.max(minTop, source.top + source.displayHeight - textHeight - inset);
  const baseLeft = source.left + inset;
  const baseTop = source.top + source.displayHeight - textHeight - inset;
  text.set({
    left: Math.min(Math.max(baseLeft, minLeft), maxLeft),
    top: Math.min(Math.max(baseTop, minTop), maxTop),
  });
}
