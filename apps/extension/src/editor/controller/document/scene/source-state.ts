import type { Canvas } from 'fabric';

import type { SourceState } from '../../../document/model/source-state';
import { getSourceObject } from '../layers';

export function resolveRelayoutSourceState(
  canvas: Canvas,
  currentSource: SourceState,
  layoutSource: {
    left: number;
    top: number;
    width: number;
    height: number;
  }
): SourceState {
  const sourceObject = getSourceObject(canvas);
  if (!sourceObject) {
    return {
      ...currentSource,
      left: layoutSource.left,
      top: layoutSource.top,
      displayWidth: layoutSource.width,
      displayHeight: layoutSource.height,
    };
  }

  return {
    ...currentSource,
    id: sourceObject.sniptaleId ?? currentSource.id,
    left: sourceObject.left ?? layoutSource.left,
    top: sourceObject.top ?? layoutSource.top,
    displayWidth: sourceObject.getScaledWidth(),
    displayHeight: sourceObject.getScaledHeight(),
    visible: sourceObject.visible !== false,
    locked: Boolean(sourceObject.sniptaleLocked),
  };
}
