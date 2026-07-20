import { type Canvas, type FabricObject, type Point } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';
import { paintRasterBrushBitmap } from '../raster/brush';
import { insertBrushLayer } from './brush-layer';
import {
  resolveBrushBitmapPoint,
  resolveBrushDraftBitmapPoint,
  resolveBrushTargetIntent,
} from './brush-target';
import { notifyEditorRasterOverlay } from './session';
import { getSelectionMaskForSnapshot, type RasterToolBindings } from './shared';
import type { EditorRasterTargetSnapshot } from '../raster/types';
import type { EditorRasterToolSessionState } from './types';

export { resolveBrushCursorStatus } from './brush-target';

export async function handleBrushMouseDown(
  bindings: RasterToolBindings,
  canvas: Canvas,
  scenePoint: Point,
  fallbackTarget?: FabricObject | null
): Promise<boolean> {
  const intent = await resolveBrushTargetIntent(bindings, canvas, fallbackTarget);
  if (intent.kind === 'blocked') {
    return false;
  }

  const bitmapPoint = resolveBrushBitmapPoint(canvas, scenePoint, intent);
  if (!bitmapPoint) {
    return false;
  }

  const session = bindings.getRasterToolSession();
  session.brushDraft = {
    bitmapPoints: [bitmapPoint],
    changed: false,
    createdTarget: intent.kind === 'create',
    snapshot: intent.snapshot,
  };
  session.hoverCursor = { scenePoint, tool: 'brush' };
  session.brushDraft.changed = paintCurrentBrushSegment(session, intent.snapshot, [bitmapPoint]);
  notifyEditorRasterOverlay(session);
  return true;
}

export function updateBrushDraft(
  session: EditorRasterToolSessionState,
  scenePoint: Point
): boolean {
  if (!session.brushDraft) {
    return false;
  }

  const bitmapPoint = resolveBrushDraftBitmapPoint(scenePoint, session.brushDraft.snapshot);
  if (!bitmapPoint) {
    return true;
  }

  const previousBitmapPoint = session.brushDraft.bitmapPoints.at(-1);
  session.brushDraft.bitmapPoints.push(bitmapPoint);
  session.hoverCursor = { scenePoint, tool: 'brush' };
  session.brushDraft.changed =
    paintCurrentBrushSegment(
      session,
      session.brushDraft.snapshot,
      previousBitmapPoint ? [previousBitmapPoint, bitmapPoint] : [bitmapPoint]
    ) || session.brushDraft.changed;
  notifyEditorRasterOverlay(session);
  return true;
}

export async function finishBrushDraft(
  bindings: RasterToolBindings,
  session: EditorRasterToolSessionState
): Promise<boolean> {
  if (!session.brushDraft) {
    return false;
  }

  const { changed, createdTarget, snapshot } = session.brushDraft;
  session.brushDraft = null;
  session.hoverCursor = null;
  notifyEditorRasterOverlay(session);
  if (!changed) {
    return true;
  }

  if (createdTarget) {
    await insertBrushLayer(bindings, snapshot);
    return true;
  }

  await bindings.applyRasterBitmap(snapshot.reference, snapshot.bitmap);
  return true;
}

export function updateBrushHoverCursor(
  session: EditorRasterToolSessionState,
  scenePoint: Point
): boolean {
  session.hoverCursor = { scenePoint, tool: 'brush' };
  notifyEditorRasterOverlay(session);
  return true;
}

function paintCurrentBrushSegment(
  session: EditorRasterToolSessionState,
  snapshot: EditorRasterTargetSnapshot,
  points: ReadonlyArray<{ x: number; y: number }>
): boolean {
  const settings = useEditorStore.getState().rasterToolSettings;
  return paintRasterBrushBitmap({
    bitmap: snapshot.bitmap,
    color: settings.brushColor,
    hardness: settings.brushHardness,
    maskCanvas: session.brushDraft?.createdTarget
      ? null
      : getSelectionMaskForSnapshot(session, snapshot),
    opacity: settings.brushOpacity,
    points,
    radius: settings.brushSize / 2,
  });
}
