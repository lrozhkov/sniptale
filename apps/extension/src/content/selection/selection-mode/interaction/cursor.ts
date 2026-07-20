import { mountStyleInAccessibleDocuments } from '../../../platform/frame';
import type { SelectionModeState } from '../session/state';

const SELECTION_CURSOR_STROKE_FALLBACK = '#3b82f6';
const SELECTION_CURSOR_STYLE_ID = 'sniptale-crosshair-cursor';

export function enableSelectionModeCursor(state: SelectionModeState): void {
  const cursor = createCrosshairCursor();
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

export function disableSelectionModeCursor(state: SelectionModeState): void {
  state.cursorStyleCleanup?.();
  state.cursorStyleCleanup = null;
}

function createCrosshairCursor(): string {
  const strokeColor = resolveSelectionCursorStroke();
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    `  <line x1="16" y1="2" x2="16" y2="13" stroke="${strokeColor}"`,
    '    stroke-width="1.5" stroke-linecap="round"/>',
    `  <line x1="16" y1="19" x2="16" y2="30" stroke="${strokeColor}"`,
    '    stroke-width="1.5" stroke-linecap="round"/>',
    `  <line x1="2" y1="16" x2="13" y2="16" stroke="${strokeColor}"`,
    '    stroke-width="1.5" stroke-linecap="round"/>',
    `  <line x1="19" y1="16" x2="30" y2="16" stroke="${strokeColor}"`,
    '    stroke-width="1.5" stroke-linecap="round"/>',
    `  <circle cx="16" cy="16" r="2.5" fill="none" stroke="${strokeColor}"`,
    '    stroke-width="1.2"/>',
    '</svg>',
  ].join('\n');
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`;
}

function resolveSelectionCursorStroke(): string {
  const resolvedAccent = getComputedStyle(document.documentElement)
    .getPropertyValue('--sniptale-color-accent')
    .trim();

  return resolvedAccent || SELECTION_CURSOR_STROKE_FALLBACK;
}
