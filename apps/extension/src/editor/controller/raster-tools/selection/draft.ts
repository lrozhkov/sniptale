import type { Canvas, Point } from 'fabric';

import { replaceRasterMaskWithPolygon, replaceRasterMaskWithRect } from '../../raster/selection';
import { resolveBitmapPoint } from '../../raster/target';
import { resolveRasterOverlayObject } from '../../raster/object';
import { notifyEditorRasterOverlay } from '../session';
import { createSelectionMaskForSnapshot, finalizeSelectionMask } from '../shared';
import type { EditorRasterToolSessionState } from '../types';

export function updateMarqueeDraft(
  session: EditorRasterToolSessionState,
  canvas: Canvas,
  overlayCanvas: Canvas | null,
  scenePoint: Point
): boolean {
  if (!session.marqueeDraft) {
    return false;
  }

  const targetObject = resolveRasterOverlayObject(
    overlayCanvas,
    session.marqueeDraft.snapshot.reference
  );
  const bitmapPoint = resolveBitmapPoint({
    snapshot: session.marqueeDraft.snapshot,
    canvas,
    reference: session.marqueeDraft.snapshot.reference,
    scenePoint,
    targetObject,
  });
  if (!bitmapPoint) {
    return true;
  }

  session.marqueeDraft.currentBitmapPoint = bitmapPoint;
  notifyEditorRasterOverlay(session);
  return true;
}

export function updateLassoDraft(
  session: EditorRasterToolSessionState,
  canvas: Canvas,
  overlayCanvas: Canvas | null,
  scenePoint: Point
): boolean {
  if (!session.lassoDraft) {
    return false;
  }

  const targetObject = resolveRasterOverlayObject(
    overlayCanvas,
    session.lassoDraft.snapshot.reference
  );
  const bitmapPoint = resolveBitmapPoint({
    snapshot: session.lassoDraft.snapshot,
    canvas,
    reference: session.lassoDraft.snapshot.reference,
    scenePoint,
    targetObject,
  });
  if (!bitmapPoint) {
    return true;
  }

  const previous = session.lassoDraft.bitmapPoints.at(-1);
  if (!previous || previous.x !== bitmapPoint.x || previous.y !== bitmapPoint.y) {
    session.lassoDraft.bitmapPoints.push(bitmapPoint);
    session.lassoDraft.scenePoints.push(scenePoint);
    notifyEditorRasterOverlay(session);
  }
  return true;
}

export function finalizeMarqueeDraft(session: EditorRasterToolSessionState): boolean {
  if (!session.marqueeDraft) {
    return false;
  }

  const { snapshot, startBitmapPoint, currentBitmapPoint } = session.marqueeDraft;
  session.marqueeDraft = null;
  const maskCanvas = createSelectionMaskForSnapshot(snapshot);
  replaceRasterMaskWithRect(maskCanvas, {
    left: Math.min(startBitmapPoint.x, currentBitmapPoint.x),
    top: Math.min(startBitmapPoint.y, currentBitmapPoint.y),
    width: Math.abs(currentBitmapPoint.x - startBitmapPoint.x),
    height: Math.abs(currentBitmapPoint.y - startBitmapPoint.y),
  });
  return finalizeSelectionMask(session, snapshot, maskCanvas);
}

export function finalizeLassoDraft(session: EditorRasterToolSessionState): boolean {
  if (!session.lassoDraft) {
    return false;
  }

  const { snapshot, bitmapPoints } = session.lassoDraft;
  session.lassoDraft = null;
  const maskCanvas = createSelectionMaskForSnapshot(snapshot);
  replaceRasterMaskWithPolygon(maskCanvas, bitmapPoints);
  return finalizeSelectionMask(session, snapshot, maskCanvas);
}
