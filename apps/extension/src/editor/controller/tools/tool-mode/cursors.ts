import type { EditorTool } from '../../../../features/editor/document/types';
import { resolveDrawingToolCursor } from '../../../../features/drawing/public';

// Native I-beam/crosshair artwork can disappear against the editor's gray workspace on some OS themes.
function workspaceCursor(path: string, hotspot: string, fallback: 'text' | 'crosshair'): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">',
    `<path d="${path}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="square"/>`,
    `<path d="${path}" fill="none" stroke="#171717" stroke-width="1" stroke-linecap="square"/>`,
    '</svg>',
  ].join('');
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot}, ${fallback}`;
}
const workspaceCrosshair = workspaceCursor('M7.5 2.5v10m-5-5h10', '7 7', 'crosshair');
const workspaceText = workspaceCursor('M5.5 2.5h4m-2 0v11m-2 0h4', '7 8', 'text');

export function resolveEditorToolCursor(tool: EditorTool, arrowDrawFromTip = false): string {
  switch (tool) {
    case 'pencil':
    case 'marker':
    case 'arrow':
    case 'blur':
    case 'select':
      return resolveDrawingToolCursor(tool, arrowDrawFromTip);
    case 'shape':
    case 'simplify':
      return workspaceCrosshair;
    case 'text':
      return workspaceText;
    case 'crop':
    case 'frame-annotation':
    case 'image':
    case 'step':
      return 'crosshair';
  }
}
