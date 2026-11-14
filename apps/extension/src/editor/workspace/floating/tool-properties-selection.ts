import { useSyncExternalStore } from 'react';
import type { EditorTool } from '../../../features/editor/document/types';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import { useEditorController } from '../../application/controller-context';
import { useEditorStore } from '../../state/useEditorStore';
import type { EditorFloatingDocumentController } from './document-bar';
import type { FloatingToolbarGroup } from './canvas-toolbar-model';
import { useRasterToolPropertiesDisclosure } from './raster-tools';
const subscribeWithoutRuntime = () => () => undefined;
const snapshotWithoutRuntime = () => null;
function isToolPropertiesEnabled(args: {
  activeTool: EditorTool;
  groups: FloatingToolbarGroup[];
  hasImage: boolean;
  inspector: EditorFloatingDocumentController['inspector'];
  selection: EditorToolbarSelectionState;
}) {
  return (
    args.hasImage &&
    args.inspector === 'tool' &&
    (!args.selection.hasSelection || args.activeTool === 'select') &&
    args.activeTool === 'step' &&
    args.groups.length > 0
  );
}

function getDrawingOptionsTool(type: string | null | undefined) {
  if (type === null || type === undefined) return null;
  switch (type) {
    case 'pencil':
    case 'marker':
    case 'shape':
    case 'arrow':
    case 'simplify':
    case 'blur':
    case 'text':
      return type;
    default:
      return null;
  }
}

type RasterRuntime = NonNullable<
  ReturnType<ReturnType<typeof useEditorController>['getRasterRuntime']>
>;
type RasterSnapshot = ReturnType<RasterRuntime['getSnapshot']> | null;

function drawingPropertiesAreVisible({
  hasImage,
  drawingOptionsTool,
  activeDrawingTool,
  selectedDrawingTool,
  collapsedDrawingOptionsTool,
  selection,
}: {
  hasImage: boolean;
  drawingOptionsTool: string | null;
  activeDrawingTool: string | null;
  selectedDrawingTool: string | null;
  collapsedDrawingOptionsTool: EditorTool | null;
  selection: EditorToolbarSelectionState;
}) {
  const matchingActiveDrawingOptionsCollapsed =
    collapsedDrawingOptionsTool === activeDrawingTool && drawingOptionsTool === activeDrawingTool;
  const drawingPropertiesEnabled =
    hasImage &&
    Boolean(drawingOptionsTool) &&
    !matchingActiveDrawingOptionsCollapsed &&
    Boolean(
      selectedDrawingTool ||
      selection.selectedObjectsAreDrawing ||
      collapsedDrawingOptionsTool !== activeDrawingTool
    );
  return drawingPropertiesEnabled;
}

function resolveDrawingProperties({
  activeTool,
  collapsedDrawingOptionsTool,
  hasImage,
  selection,
}: {
  activeTool: EditorTool;
  collapsedDrawingOptionsTool: EditorTool | null;
  hasImage: boolean;
  selection: EditorToolbarSelectionState;
}) {
  const selectedDrawingTool = getDrawingOptionsTool(selection.selectedObjectType);
  const activeDrawingTool = getDrawingOptionsTool(activeTool);
  const drawingOptionsTool =
    selectedDrawingTool ??
    (selection.selectedObjectsAreDrawing && selection.hasSelection
      ? ('selection' as const)
      : null) ??
    activeDrawingTool;
  const drawingPropertiesEnabled = drawingPropertiesAreVisible({
    hasImage,
    drawingOptionsTool,
    activeDrawingTool,
    selectedDrawingTool,
    collapsedDrawingOptionsTool,
    selection,
  });
  return { selectedDrawingTool, drawingOptionsTool, drawingPropertiesEnabled };
}

function isRasterTargetSelected(
  rasterSnapshot: RasterSnapshot,
  selection: EditorToolbarSelectionState
) {
  const rasterTargetSelected = Boolean(
    rasterSnapshot?.available &&
    selection.selectedObjectCount === 1 &&
    (selection.selectedObjectType === 'image' ||
      selection.selectedObjectType === 'source-image' ||
      selection.selectedObjectType === 'background')
  );
  return rasterTargetSelected;
}

function resolveRasterProperties(
  rasterSnapshot: RasterSnapshot,
  selection: EditorToolbarSelectionState,
  collapsedTool: string | null | undefined
) {
  const rasterTargetSelected = isRasterTargetSelected(rasterSnapshot, selection);
  const rasterEnabled = Boolean(
    rasterTargetSelected &&
    rasterSnapshot &&
    (!rasterSnapshot.editing ||
      (rasterSnapshot.tool !== null && collapsedTool !== rasterSnapshot.tool) ||
      rasterSnapshot.error !== null)
  );
  const rasterActionsEnabled = Boolean(
    rasterTargetSelected && rasterSnapshot?.editing && rasterSnapshot.selection !== 'none'
  );
  return { rasterEnabled, rasterActionsEnabled };
}

function areVectorPropertiesEnabled({
  hasImage,
  activeTool,
  selection,
  canvas,
}: {
  hasImage: boolean;
  activeTool: EditorTool;
  selection: EditorToolbarSelectionState;
  canvas: ReturnType<typeof useEditorController>['canvas'];
}) {
  const vectorEnabled =
    hasImage &&
    activeTool === 'select' &&
    selection.hasSelection &&
    Boolean(canvas?.getActiveObjects().length) &&
    Boolean(canvas?.getActiveObjects().every((object) => object.sniptaleType === 'vector-element'));
  return vectorEnabled;
}

export function useToolPropertiesSelection({
  activeTool,
  collapsedDrawingOptionsTool,
  hasImage,
  selection,
  inspector,
  groups,
}: {
  activeTool: EditorTool;
  collapsedDrawingOptionsTool: EditorTool | null;
  hasImage: boolean;
  selection: EditorToolbarSelectionState;
  inspector: EditorFloatingDocumentController['inspector'];
  groups: FloatingToolbarGroup[];
}) {
  const controller = useEditorController();
  const layers = useEditorStore((state) => state.layers);
  const standardPropertiesEnabled = isToolPropertiesEnabled({
    activeTool,
    groups,
    hasImage,
    inspector,
    selection,
  });
  const { selectedDrawingTool, drawingOptionsTool, drawingPropertiesEnabled } =
    resolveDrawingProperties({
      activeTool,
      collapsedDrawingOptionsTool,
      hasImage,
      selection,
    });
  const rasterRuntime = controller.getRasterRuntime();
  const rasterSnapshot = useSyncExternalStore(
    rasterRuntime?.subscribe ?? subscribeWithoutRuntime,
    rasterRuntime?.getSnapshot ?? snapshotWithoutRuntime
  );
  const rasterDisclosure = useRasterToolPropertiesDisclosure();
  const { rasterEnabled, rasterActionsEnabled } = resolveRasterProperties(
    rasterSnapshot,
    selection,
    rasterDisclosure?.collapsedTool
  );
  const vectorEnabled = areVectorPropertiesEnabled({
    hasImage,
    activeTool,
    selection,
    canvas: controller.canvas,
  });
  const enabled =
    vectorEnabled ||
    standardPropertiesEnabled ||
    drawingPropertiesEnabled ||
    rasterEnabled ||
    rasterActionsEnabled;
  const showSelectionActions =
    (drawingPropertiesEnabled || vectorEnabled) && selection.hasSelection;
  return {
    controller,
    layers,
    standardPropertiesEnabled,
    drawingPropertiesEnabled,
    drawingOptionsTool,
    selectedDrawingTool,
    rasterRuntime,
    rasterSnapshot,
    rasterEnabled,
    rasterActionsEnabled,
    vectorEnabled,
    enabled,
    showSelectionActions,
  };
}
