import type { Canvas } from 'fabric';
import { getSourceObject } from '../document/layers';

import type { SourceState } from '../../document/model/source-state';

export function readCurrentBrowserFrameSourceState(
  canvas: Canvas,
  fallback: SourceState | null | undefined
): SourceState | null {
  const sourceObject = getSourceObject(canvas);
  if (!sourceObject) {
    return fallback ?? null;
  }

  return {
    id: sourceObject.sniptaleId ?? fallback?.id ?? 'source-image-layer',
    dataUrl: fallback?.dataUrl ?? '',
    name: fallback?.name ?? null,
    intrinsicWidth: fallback?.intrinsicWidth ?? sourceObject.getScaledWidth(),
    intrinsicHeight: fallback?.intrinsicHeight ?? sourceObject.getScaledHeight(),
    left: sourceObject.left ?? fallback?.left ?? 0,
    top: sourceObject.top ?? fallback?.top ?? 0,
    displayWidth: sourceObject.getScaledWidth(),
    displayHeight: sourceObject.getScaledHeight(),
    visible: sourceObject.visible !== false,
    locked: Boolean(sourceObject.sniptaleLocked),
  };
}
