import { calculateContentSizeTooltipPosition } from '@sniptale/ui/content-size-tooltip/core';

export function calculateInteractiveFrameSizePanelPosition(frameRect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return calculateContentSizeTooltipPosition({ anchorRect: frameRect });
}

export function calculateInteractiveFrameToolbarPosition(frameRect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const toolbarHeight = 45;
  const toolbarWidth = 200;
  const margin = 10;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const spaceTop = frameRect.y;
  const spaceBottom = viewportHeight - frameRect.y - frameRect.height;

  let x = frameRect.x;
  let y = frameRect.y - toolbarHeight - margin;

  if (spaceTop < toolbarHeight + margin) {
    y = frameRect.y + frameRect.height + margin;
    if (spaceBottom < toolbarHeight + margin) {
      y = frameRect.y + margin;
      x = frameRect.x + margin;
    }
  }

  if (x + toolbarWidth > viewportWidth - margin) {
    x = viewportWidth - toolbarWidth - margin;
  }
  if (x < margin) {
    x = margin;
  }

  if (y >= frameRect.y && y < frameRect.y + frameRect.height) {
    const spaceRight = viewportWidth - frameRect.x - frameRect.width;
    if (spaceRight >= toolbarWidth + margin) {
      x = frameRect.x + frameRect.width - toolbarWidth - margin;
    }
  }

  return { x, y };
}
