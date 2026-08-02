import type { BrowserFrameAnnotationInput } from './types';

export function areBrowserFrameAnnotationsEqual(
  left: BrowserFrameAnnotationInput,
  right: BrowserFrameAnnotationInput
): boolean {
  return (
    left.borderPresetName === right.borderPresetName &&
    left.comment === right.comment &&
    left.frameId === right.frameId &&
    left.kind === right.kind &&
    left.linkedElementSelector === right.linkedElementSelector &&
    left.pageUrl === right.pageUrl &&
    left.rect.height === right.rect.height &&
    left.rect.width === right.rect.width &&
    left.rect.x === right.rect.x &&
    left.rect.y === right.rect.y &&
    left.viewport.height === right.viewport.height &&
    left.viewport.width === right.viewport.width
  );
}
