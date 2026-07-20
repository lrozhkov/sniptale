import type { EditorFrameSettings } from '../../../../../features/editor/document/types';

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
