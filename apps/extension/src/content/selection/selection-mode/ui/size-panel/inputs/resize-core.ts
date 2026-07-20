import type { Selection } from '../../../types';
import type { SizeChangeOptions } from './types';

export function resizeSelectionWidth(selection: Selection, options: SizeChangeOptions): Selection {
  const oldWidth = selection.width;
  const requestedWidth = options.nextValue ?? selection.width + (options.delta ?? 0);
  const nextWidth = Math.min(Math.max(requestedWidth, options.minSelectionSize), options.maxWidth);

  selection.width = nextWidth;
  selection.x -= (nextWidth - oldWidth) / 2;

  if (options.maintainAspectRatio && options.aspectRatio) {
    const newHeight = Math.round(nextWidth / options.aspectRatio);
    const oldHeight = selection.height;
    selection.height = Math.min(Math.max(newHeight, options.minSelectionSize), options.maxHeight);
    selection.y -= (selection.height - oldHeight) / 2;
  }

  return selection;
}

export function resizeSelectionHeight(selection: Selection, options: SizeChangeOptions): Selection {
  const oldHeight = selection.height;
  const requestedHeight = options.nextValue ?? selection.height + (options.delta ?? 0);
  const nextHeight = Math.min(
    Math.max(requestedHeight, options.minSelectionSize),
    options.maxHeight
  );

  selection.height = nextHeight;
  selection.y -= (nextHeight - oldHeight) / 2;

  if (options.maintainAspectRatio && options.aspectRatio) {
    const newWidth = Math.round(nextHeight * options.aspectRatio);
    const oldWidth = selection.width;
    selection.width = Math.min(Math.max(newWidth, options.minSelectionSize), options.maxWidth);
    selection.x -= (selection.width - oldWidth) / 2;
  }

  return selection;
}
