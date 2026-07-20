import type { Canvas, FabricObject } from 'fabric';
import {
  EDITOR_RASTER_TARGET_STATUS,
  type EditorRasterTargetSummary,
  EMPTY_EDITOR_RASTER_TARGET_SUMMARY,
} from '../../state/raster-tools';
import { getSingleSelectionType, isEditableObject } from '../../document/model';
import { isEditorRasterLayerType } from '../layer-effects/rasterize';
import type { EditorRasterResolvedTarget } from './types';

export function resolveRasterTarget(args: {
  canvas: Canvas | null;
  fallbackTarget?: FabricObject | null | undefined;
}): EditorRasterResolvedTarget | null {
  return resolveRasterTargetState(args).target;
}

export function resolveRasterTargetState(args: {
  canvas: Canvas | null;
  fallbackTarget?: FabricObject | null | undefined;
}): {
  summary: EditorRasterTargetSummary;
  target: EditorRasterResolvedTarget | null;
} {
  const activeObjects = args.canvas?.getActiveObjects() ?? [];
  if (activeObjects.length > 1) {
    return createBlockedRasterTargetState(EDITOR_RASTER_TARGET_STATUS.MULTIPLE);
  }

  if (args.fallbackTarget) {
    return createRasterTargetStateFromObject(args.fallbackTarget);
  }

  const [activeObject] = activeObjects;
  if (!activeObject) {
    return createMissingRasterTargetState();
  }

  return createRasterTargetStateFromObject(activeObject);
}

function createRasterTargetStateFromObject(object: FabricObject): {
  summary: EditorRasterTargetSummary;
  target: EditorRasterResolvedTarget | null;
} {
  const reference = createObjectReference(object);
  if (!isEditableObject(object) || object.visible === false) {
    return createMissingRasterTargetState();
  }

  if (object.sniptaleLocked) {
    return createBlockedRasterTargetState(EDITOR_RASTER_TARGET_STATUS.LOCKED, reference);
  }

  const status = isEditorRasterLayerType(object.sniptaleType)
    ? EDITOR_RASTER_TARGET_STATUS.READY
    : EDITOR_RASTER_TARGET_STATUS.WILL_RASTERIZE;
  return createReadyRasterTargetState(object, reference, status);
}

function createObjectReference(object: FabricObject): EditorRasterResolvedTarget['reference'] {
  return {
    kind: 'object',
    objectId: object.sniptaleId ?? crypto.randomUUID(),
    objectName: object.sniptaleLabel ?? getSingleSelectionType([object]) ?? 'Layer',
  };
}

function createMissingRasterTargetState(): {
  summary: EditorRasterTargetSummary;
  target: null;
} {
  return {
    summary: EMPTY_EDITOR_RASTER_TARGET_SUMMARY,
    target: null,
  };
}

function createBlockedRasterTargetState(
  status: Extract<
    EditorRasterTargetSummary['status'],
    | typeof EDITOR_RASTER_TARGET_STATUS.LOCKED
    | typeof EDITOR_RASTER_TARGET_STATUS.MULTIPLE
    | typeof EDITOR_RASTER_TARGET_STATUS.UNSUPPORTED
  >,
  reference?: EditorRasterResolvedTarget['reference']
): {
  summary: EditorRasterTargetSummary;
  target: null;
} {
  return {
    summary: {
      status,
      layerId: reference?.objectId ?? null,
      layerName: reference?.objectName ?? null,
    },
    target: null,
  };
}

function createReadyRasterTargetState(
  object: FabricObject,
  reference: EditorRasterResolvedTarget['reference'],
  status: Extract<
    EditorRasterTargetSummary['status'],
    typeof EDITOR_RASTER_TARGET_STATUS.READY | typeof EDITOR_RASTER_TARGET_STATUS.WILL_RASTERIZE
  >
): {
  summary: EditorRasterTargetSummary;
  target: EditorRasterResolvedTarget;
} {
  return {
    summary: {
      status,
      layerId: reference.objectId,
      layerName: reference.objectName,
    },
    target: {
      object,
      reference,
    },
  };
}
