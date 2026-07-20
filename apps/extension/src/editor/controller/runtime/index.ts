import type { Canvas, FabricObject } from 'fabric';
import type { EditorViewportState } from '../../../features/editor/document/types';
import type { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { useEditorStore } from '../../state/useEditorStore';
import { collectLayers, getObjectDimensions } from '../document/layers';
import { isRichShapeObject } from '../../objects/rich-shape';
import { syncSelectionToolSettingsFromObject } from '../selection';
import { getSingleSelectionType, isUserObject } from '../../document/model';

function getSelectedObjectLabel(object: FabricObject | null): string | null {
  if (!object || !isRichShapeObject(object)) {
    return null;
  }

  return object.sniptaleRichShape.source?.name ?? object.sniptaleRichShape.shapeKind;
}

function getEditorHistoryState(history: SnapshotHistory<string> | null) {
  return history
    ? {
        canUndo: history.getState().canUndo,
        canRedo: history.getState().canRedo,
        index: history.getState().index,
        size: history.getState().size,
      }
    : { canUndo: false, canRedo: false, index: 0, size: 1 };
}

function getSelectedObject(activeObjects: FabricObject[]) {
  const [singleActiveObject] = activeObjects;
  return activeObjects.length === 1 && singleActiveObject ? singleActiveObject : null;
}

export function syncEditorRuntimeState(
  canvas: Canvas | null,
  history: SnapshotHistory<string> | null,
  cropGuide: FabricObject | null,
  cropSelection: { left: number; top: number; width: number; height: number } | null,
  viewport: EditorViewportState
): void {
  const store = useEditorStore.getState();
  const layers = collectLayers(canvas);
  const activeObjects = canvas?.getActiveObjects().filter(isUserObject) ?? [];
  const selectedObjectIds = activeObjects
    .map((object) => object.sniptaleId)
    .filter((id): id is string => Boolean(id));
  const singleType = getSingleSelectionType(activeObjects);
  const selectedObject = getSelectedObject(activeObjects);
  const selectedDimensions = selectedObject ? getObjectDimensions(selectedObject) : null;

  if (selectedObject && singleType) {
    syncSelectionToolSettingsFromObject(selectedObject, singleType);
  }

  const historyState = getEditorHistoryState(history);

  store.syncRuntime({
    layers,
    selection: {
      hasSelection: activeObjects.length > 0,
      selectedObjectCount: activeObjects.length,
      selectedObjectType: singleType,
      selectedObjectId: selectedObject
        ? ((selectedObject.sniptaleId ?? null) as string | null)
        : null,
      selectedObjectIds,
      selectedObjectLabel: getSelectedObjectLabel(selectedObject),
      selectedObjectLocked: Boolean(selectedObject?.sniptaleLocked),
      selectedObjectWidth: selectedDimensions?.width ?? null,
      selectedObjectHeight: selectedDimensions?.height ?? null,
    },
    cropSelection,
    history: historyState,
    viewport,
    frame: store.frame,
    browserFrame: store.browserFrame,
  });
  store.setCropReady(Boolean(cropGuide && cropSelection));
}

export function scheduleEditorZoomToFit(callback: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}
