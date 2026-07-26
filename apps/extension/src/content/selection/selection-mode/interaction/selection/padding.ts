import { MIN_SELECTION_SIZE } from '../../constants';
import type { Selection } from '../../types';

const SELECTION_PADDING_STEP = 5;

export function canDecreaseSelectionPadding(selection: Selection): boolean {
  return (
    selection.width - SELECTION_PADDING_STEP * 2 >= MIN_SELECTION_SIZE &&
    selection.height - SELECTION_PADDING_STEP * 2 >= MIN_SELECTION_SIZE
  );
}

export function canIncreaseSelectionPadding(
  selection: Selection,
  viewport: { width: number; height: number }
): boolean {
  return (
    selection.x >= SELECTION_PADDING_STEP &&
    selection.y >= SELECTION_PADDING_STEP &&
    selection.x + selection.width + SELECTION_PADDING_STEP <= viewport.width &&
    selection.y + selection.height + SELECTION_PADDING_STEP <= viewport.height
  );
}

export function adjustSelectionPadding(
  selection: Selection,
  direction: 'decrease' | 'increase',
  viewport: { width: number; height: number }
): Selection {
  if (direction === 'decrease') {
    if (!canDecreaseSelectionPadding(selection)) {
      return selection;
    }

    return {
      x: selection.x + SELECTION_PADDING_STEP,
      y: selection.y + SELECTION_PADDING_STEP,
      width: selection.width - SELECTION_PADDING_STEP * 2,
      height: selection.height - SELECTION_PADDING_STEP * 2,
    };
  }

  if (!canIncreaseSelectionPadding(selection, viewport)) {
    return selection;
  }

  return {
    x: selection.x - SELECTION_PADDING_STEP,
    y: selection.y - SELECTION_PADDING_STEP,
    width: selection.width + SELECTION_PADDING_STEP * 2,
    height: selection.height + SELECTION_PADDING_STEP * 2,
  };
}
