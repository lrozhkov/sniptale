import { mountStyleInAccessibleDocuments } from '../../../platform/frame';
import type { SelectionModeSession } from '../session';

const SELECTION_CURSOR_STYLE_ID = 'sniptale-crosshair-cursor';

type SelectionModeCursorSession = Pick<SelectionModeSession, 'cursorStyleCleanup'>;

export function enableSelectionModeCursor(state: SelectionModeCursorSession): void {
  const cursor = createSelectionCrosshairCursor();
  state.cursorStyleCleanup?.();
  state.cursorStyleCleanup = mountStyleInAccessibleDocuments({
    styleId: SELECTION_CURSOR_STYLE_ID,
    textContent: `
    *, *::before, *::after { cursor: ${cursor} !important; }
    .sniptale-selection-final-frame { cursor: move !important; }
    .sniptale-selection-final-frame * { cursor: default !important; }
    .sniptale-content-size-tooltip input,
    .sniptale-selection-final-frame input,
    .sniptale-selection-final-frame textarea { cursor: text !important; }
    .sniptale-content-size-tooltip button,
    .sniptale-selection-final-frame button { cursor: pointer !important; }
    .sniptale-resize-handle[data-direction="nw"],
    .sniptale-resize-handle[data-direction="se"] { cursor: nwse-resize !important; }
    .sniptale-resize-handle[data-direction="ne"],
    .sniptale-resize-handle[data-direction="sw"] { cursor: nesw-resize !important; }
    .sniptale-resize-handle[data-direction="n"],
    .sniptale-resize-handle[data-direction="s"] { cursor: ns-resize !important; }
    .sniptale-resize-handle[data-direction="e"],
    .sniptale-resize-handle[data-direction="w"] { cursor: ew-resize !important; }
  `,
  });
}

export function disableSelectionModeCursor(state: SelectionModeCursorSession): void {
  state.cursorStyleCleanup?.();
  state.cursorStyleCleanup = null;
}

export function createSelectionCrosshairCursor(): string {
  return 'crosshair';
}
