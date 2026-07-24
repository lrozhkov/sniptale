import type { Canvas } from 'fabric';

import type { EditorFrameSettings } from '../../../../../features/editor/document/types';
import { isBrowserFrameObject } from '../../../../document/model';

export function hasBrowserFrameLayer(canvas: Canvas | null): boolean {
  return (canvas?.getObjects?.() ?? []).some((object) => isBrowserFrameObject(object));
}

export function doesFrameGeometryChange(
  currentFrame: EditorFrameSettings,
  nextFrame: EditorFrameSettings
): boolean {
  return (
    currentFrame.layoutMode !== nextFrame.layoutMode ||
    currentFrame.paddingTop !== nextFrame.paddingTop ||
    currentFrame.paddingRight !== nextFrame.paddingRight ||
    currentFrame.paddingBottom !== nextFrame.paddingBottom ||
    currentFrame.paddingLeft !== nextFrame.paddingLeft
  );
}
