import type { EditorTool } from '../../../features/editor/document/types';
import type { EditorInspector } from '../../state/types';
import type { EditorToolbarSelectionState } from '../toolbar/types';

export type EditorFloatingLeftDrawerMode = 'shapes-and-lines' | 'rough-shape' | 'shape-library';

export type EditorFloatingRightUtilityMode =
  | 'frame'
  | 'browser-frame'
  | 'meta'
  | 'workspace'
  | 'grid'
  | 'canvas-size'
  | 'image-size'
  | 'layer-effects';

interface EditorFloatingSurfaceRoute {
  canvasSelectionToolbar: boolean;
  leftDrawer: EditorFloatingLeftDrawerMode | null;
  rightUtility: EditorFloatingRightUtilityMode | null;
}

const LEFT_DRAWER_TOOLS = new Set<EditorTool>(['shapes-and-lines', 'rough-shape', 'shape-library']);

const RIGHT_UTILITY_INSPECTORS = new Set<EditorInspector>([
  'frame',
  'browser-frame',
  'meta',
  'workspace',
  'grid',
  'canvas-size',
  'image-size',
  'layer-effects',
]);

const SELECTION_TOOLBAR_BLOCKED_TOOLS = new Set<EditorTool>([
  'crop',
  'selection',
  'brush',
  'eraser',
  'fill',
]);

export function isLeftDrawerMode(tool: EditorTool): tool is EditorFloatingLeftDrawerMode {
  return LEFT_DRAWER_TOOLS.has(tool);
}

export function isRightUtilityMode(
  inspector: EditorInspector
): inspector is EditorFloatingRightUtilityMode {
  return RIGHT_UTILITY_INSPECTORS.has(inspector);
}

export function isCanvasSelectionToolbarEligible(args: {
  activeTool: EditorTool;
  hasImage: boolean;
  inspector: EditorInspector;
  selection: Pick<EditorToolbarSelectionState, 'hasSelection'>;
}) {
  return (
    args.hasImage &&
    args.inspector === 'tool' &&
    args.selection.hasSelection &&
    !SELECTION_TOOLBAR_BLOCKED_TOOLS.has(args.activeTool)
  );
}

export function resolveFloatingSurfaceRoute(args: {
  activeTool: EditorTool;
  dismissedLeftDrawerTool?: EditorTool | null;
  hasImage: boolean;
  inspector: EditorInspector;
  selection: Pick<EditorToolbarSelectionState, 'hasSelection'>;
}): EditorFloatingSurfaceRoute {
  const leftDrawer =
    args.hasImage &&
    args.inspector === 'tool' &&
    isLeftDrawerMode(args.activeTool) &&
    args.dismissedLeftDrawerTool !== args.activeTool
      ? args.activeTool
      : null;
  const rightUtility = args.hasImage && isRightUtilityMode(args.inspector) ? args.inspector : null;

  return {
    canvasSelectionToolbar: isCanvasSelectionToolbarEligible(args),
    leftDrawer,
    rightUtility,
  };
}
