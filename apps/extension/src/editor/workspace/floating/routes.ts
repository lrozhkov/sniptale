import type { EditorTool } from '../../../features/editor/document/types';
import type { EditorInspector } from '../../state/types';
import type { EditorToolbarSelectionState } from '../toolbar/types';

export type EditorFloatingLeftDrawerMode = 'shape';

interface EditorFloatingSurfaceRoute {
  canvasSelectionToolbar: boolean;
  leftDrawer: EditorFloatingLeftDrawerMode | null;
}

// The catalog/import implementation is intentionally retained but suspended until the
// dedicated rich-shape integration wave. The shared shape tool never opens this drawer.
const LEFT_DRAWER_TOOLS = new Set<EditorTool>();

const SELECTION_TOOLBAR_BLOCKED_TOOLS = new Set<EditorTool>(['crop']);

function isLeftDrawerMode(tool: EditorTool): tool is EditorFloatingLeftDrawerMode {
  return LEFT_DRAWER_TOOLS.has(tool);
}

function isCanvasSelectionToolbarEligible(args: {
  activeTool: EditorTool;
  hasImage: boolean;
  inspector: EditorInspector;
  selection: Pick<EditorToolbarSelectionState, 'hasSelection'> &
    Partial<
      Pick<
        EditorToolbarSelectionState,
        'selectedObjectCount' | 'selectedObjectType' | 'selectedObjectsAreDrawing'
      >
    >;
}) {
  return (
    args.hasImage &&
    args.inspector === 'tool' &&
    args.selection.hasSelection &&
    args.selection.selectedObjectsAreDrawing !== true &&
    !(
      args.selection.selectedObjectCount === 1 &&
      args.selection.selectedObjectType === 'frame-annotation'
    ) &&
    !SELECTION_TOOLBAR_BLOCKED_TOOLS.has(args.activeTool)
  );
}

export function resolveFloatingSurfaceRoute(args: {
  activeTool: EditorTool;
  dismissedLeftDrawerTool?: EditorTool | null;
  hasImage: boolean;
  inspector: EditorInspector;
  selection: Pick<EditorToolbarSelectionState, 'hasSelection'> &
    Partial<
      Pick<
        EditorToolbarSelectionState,
        'selectedObjectCount' | 'selectedObjectType' | 'selectedObjectsAreDrawing'
      >
    >;
}): EditorFloatingSurfaceRoute {
  const leftDrawer =
    args.hasImage &&
    args.inspector === 'tool' &&
    isLeftDrawerMode(args.activeTool) &&
    args.dismissedLeftDrawerTool !== args.activeTool
      ? args.activeTool
      : null;
  return {
    canvasSelectionToolbar: isCanvasSelectionToolbarEligible(args),
    leftDrawer,
  };
}
