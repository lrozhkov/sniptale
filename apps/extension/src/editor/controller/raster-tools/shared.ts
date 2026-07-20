import type { Canvas, FabricObject } from 'fabric';
import { clearEditorRasterSelection, setEditorRasterSelection } from './session';
import type { EditorRasterToolSessionState } from './types';
import { createRasterTargetSnapshot, resolveRasterTarget } from '../raster/target';
import { createEmptyRasterMask, rasterMaskHasPixels } from '../raster/selection';
import { resolveRasterOverlayObject } from '../raster/object';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventObjectBindings,
  EditorControllerEventStateBindings,
} from '../events/types';
import type { EditorRasterTargetSnapshot } from '../raster/types';

export type RasterToolBindings = EditorControllerEventStateBindings &
  Pick<
    EditorControllerEventCommandBindings & EditorControllerEventObjectBindings,
    'addObject' | 'applyRasterBitmap' | 'nextLabelIndex' | 'syncRuntimeState'
  >;

export async function resolveSnapshotForEdit(
  bindings: RasterToolBindings,
  canvas: Canvas,
  fallbackTarget?: FabricObject | null
): Promise<{
  snapshot: EditorRasterTargetSnapshot;
  targetObject: FabricObject | null;
} | null> {
  const session = bindings.getRasterToolSession();
  if (session.selection) {
    return await resolveSelectedSnapshot(bindings, session);
  }

  const resolvedTarget = resolveRasterTarget({ canvas, fallbackTarget });
  if (!resolvedTarget) {
    return null;
  }

  return {
    snapshot: await createRasterTargetSnapshot(resolvedTarget),
    targetObject: resolvedTarget.object,
  };
}

async function resolveSelectedSnapshot(
  bindings: RasterToolBindings,
  session: EditorRasterToolSessionState
) {
  const selection = session.selection;
  if (!selection) {
    return null;
  }

  const targetObject = resolveRasterOverlayObject(bindings.getCanvas(), selection.reference);
  if (!targetObject) {
    clearEditorRasterSelection(session);
    bindings.syncRuntimeState();
    return null;
  }

  return {
    snapshot: await createRasterTargetSnapshot({
      object: targetObject as FabricObject,
      reference: selection.reference,
    }),
    targetObject: targetObject as FabricObject,
  };
}

export function finalizeSelectionMask(
  session: EditorRasterToolSessionState,
  snapshot: EditorRasterTargetSnapshot,
  maskCanvas: HTMLCanvasElement
): boolean {
  if (!rasterMaskHasPixels(maskCanvas)) {
    clearEditorRasterSelection(session);
    return true;
  }

  setEditorRasterSelection(session, {
    reference: snapshot.reference,
    maskCanvas,
  });
  return true;
}

export function createSelectionMaskForSnapshot(snapshot: EditorRasterTargetSnapshot) {
  return createEmptyRasterMask(snapshot.bitmap.width, snapshot.bitmap.height);
}

export function getSelectionMaskForSnapshot(
  session: EditorRasterToolSessionState,
  snapshot: EditorRasterTargetSnapshot
): HTMLCanvasElement | null {
  if (!session.selection || !referencesMatch(session.selection.reference, snapshot.reference)) {
    return null;
  }

  return session.selection.maskCanvas;
}

function referencesMatch(
  left: EditorRasterTargetSnapshot['reference'],
  right: EditorRasterTargetSnapshot['reference']
): boolean {
  return left.objectId === right.objectId;
}

export function mapScenePointToBitmap(
  snapshot: EditorRasterTargetSnapshot,
  point: { x: number; y: number }
) {
  return {
    x:
      ((point.x - snapshot.sceneBounds.left) / Math.max(snapshot.sceneBounds.width, 1)) *
      snapshot.bitmap.width,
    y:
      ((point.y - snapshot.sceneBounds.top) / Math.max(snapshot.sceneBounds.height, 1)) *
      snapshot.bitmap.height,
  };
}
