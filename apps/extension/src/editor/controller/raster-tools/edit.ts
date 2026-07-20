import type { Canvas, FabricObject, Point } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';
import { notifyEditorRasterOverlay } from './session';
import type { EditorRasterToolSessionState } from './types';
import {
  getSelectionMaskForSnapshot,
  resolveSnapshotForEdit,
  type RasterToolBindings,
} from './shared';
import { eraseRasterBitmap } from '../raster/mutations';
import { resolveBitmapPoint } from '../raster/target';
import { resolveRasterOverlayObject } from '../raster/object';
import type { EditorRasterTargetSnapshot } from '../raster/types';

export async function handleEraserMouseDown(
  bindings: RasterToolBindings,
  canvas: Canvas,
  scenePoint: Point,
  fallbackTarget?: FabricObject | null
): Promise<boolean> {
  const resolved = await resolveSnapshotForEdit(bindings, canvas, fallbackTarget);
  if (!resolved) {
    return false;
  }

  const bitmapPoint = resolveBitmapPoint({
    snapshot: resolved.snapshot,
    canvas,
    reference: resolved.snapshot.reference,
    scenePoint,
    targetObject: resolved.targetObject,
  });
  if (!bitmapPoint) {
    return false;
  }

  const session = bindings.getRasterToolSession();
  session.eraserDraft = {
    snapshot: resolved.snapshot,
    bitmapPoints: [bitmapPoint],
  };
  session.hoverCursor = { scenePoint, tool: 'eraser' };
  eraseCurrentSegment(session, resolved.snapshot, [bitmapPoint]);
  notifyEditorRasterOverlay(session);
  return true;
}

function eraseCurrentSegment(
  session: EditorRasterToolSessionState,
  snapshot: EditorRasterTargetSnapshot,
  points: ReadonlyArray<{ x: number; y: number }>
) {
  eraseRasterBitmap({
    bitmap: snapshot.bitmap,
    points,
    radius: useEditorStore.getState().rasterToolSettings.eraserSize / 2,
    maskCanvas: getSelectionMaskForSnapshot(session, snapshot),
  });
}

export function updateEraserDraft(
  session: EditorRasterToolSessionState,
  canvas: Canvas,
  overlayCanvas: Canvas | null,
  scenePoint: Point
): boolean {
  if (!session.eraserDraft) {
    return false;
  }

  const bitmapPoint = resolveBitmapPoint({
    snapshot: session.eraserDraft.snapshot,
    canvas,
    reference: session.eraserDraft.snapshot.reference,
    scenePoint,
    targetObject: resolveRasterOverlayObject(overlayCanvas, session.eraserDraft.snapshot.reference),
  });
  if (!bitmapPoint) {
    return true;
  }

  const previousBitmapPoint = session.eraserDraft.bitmapPoints.at(-1);
  session.eraserDraft.bitmapPoints.push(bitmapPoint);
  session.hoverCursor = { scenePoint, tool: 'eraser' };
  eraseCurrentSegment(
    session,
    session.eraserDraft.snapshot,
    previousBitmapPoint ? [previousBitmapPoint, bitmapPoint] : [bitmapPoint]
  );
  notifyEditorRasterOverlay(session);
  return true;
}

export async function finishEraserDraft(
  bindings: RasterToolBindings,
  session: EditorRasterToolSessionState
): Promise<boolean> {
  if (!session.eraserDraft) {
    return false;
  }

  const { snapshot } = session.eraserDraft;
  session.eraserDraft = null;
  session.hoverCursor = null;
  notifyEditorRasterOverlay(session);
  await bindings.applyRasterBitmap(snapshot.reference, snapshot.bitmap);
  return true;
}

export function updateRasterHoverCursor(
  session: EditorRasterToolSessionState,
  scenePoint: Point
): boolean {
  session.hoverCursor = { scenePoint, tool: 'eraser' };
  notifyEditorRasterOverlay(session);
  return true;
}
