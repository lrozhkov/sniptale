import type { Canvas, FabricObject, Point } from 'fabric';

import { useEditorStore } from '../../../state/useEditorStore';
import { EDITOR_RASTER_SELECTION_MODE } from '../../../state/raster-tools';
import { replaceRasterMaskWithFloodSelection } from '../../raster/selection';
import type { EditorRasterTargetSnapshot } from '../../raster/types';
import {
  createRasterTargetSnapshot,
  resolveBitmapPoint,
  resolveRasterTarget,
} from '../../raster/target';
import { resolveRasterOverlayObject } from '../../raster/object';
import { notifyEditorRasterOverlay } from '../session';
import {
  createSelectionMaskForSnapshot,
  finalizeSelectionMask,
  type RasterToolBindings,
} from '../shared';
import type { EditorRasterToolSessionState } from '../types';

const MAGIC_WAND_TOLERANCE = 96;

export async function handleSelectionMouseDown(
  bindings: RasterToolBindings,
  canvas: Canvas,
  scenePoint: Point,
  fallbackTarget?: FabricObject | null
): Promise<boolean> {
  const resolvedTarget = resolveRasterTarget({ canvas, fallbackTarget });
  if (!resolvedTarget) {
    return false;
  }

  const snapshot = await createRasterTargetSnapshot(resolvedTarget);
  const targetObject = resolveRasterOverlayObject(bindings.getCanvas(), snapshot.reference);
  const bitmapPoint = resolveBitmapPoint({
    snapshot,
    canvas,
    reference: snapshot.reference,
    scenePoint,
    targetObject,
  });
  if (!bitmapPoint) {
    return false;
  }

  const settings = useEditorStore.getState().rasterToolSettings;
  const session = bindings.getRasterToolSession();
  switch (settings.selectionMode) {
    case EDITOR_RASTER_SELECTION_MODE.WAND:
      return applyWandSelection(session, snapshot, bitmapPoint);
    case EDITOR_RASTER_SELECTION_MODE.LASSO:
      session.lassoDraft = {
        snapshot,
        bitmapPoints: [bitmapPoint],
        scenePoints: [scenePoint],
      };
      notifyEditorRasterOverlay(session);
      return true;
    case EDITOR_RASTER_SELECTION_MODE.MARQUEE:
      session.marqueeDraft = {
        snapshot,
        startBitmapPoint: bitmapPoint,
        currentBitmapPoint: bitmapPoint,
      };
      notifyEditorRasterOverlay(session);
      return true;
  }
}

function applyWandSelection(
  session: EditorRasterToolSessionState,
  snapshot: EditorRasterTargetSnapshot,
  bitmapPoint: { x: number; y: number }
) {
  const maskCanvas = createSelectionMaskForSnapshot(snapshot);
  replaceRasterMaskWithFloodSelection({
    maskCanvas,
    imageData: snapshot.bitmap
      .getContext('2d')!
      .getImageData(0, 0, snapshot.bitmap.width, snapshot.bitmap.height),
    startX: bitmapPoint.x,
    startY: bitmapPoint.y,
    tolerance: MAGIC_WAND_TOLERANCE,
  });
  return finalizeSelectionMask(session, snapshot, maskCanvas);
}
