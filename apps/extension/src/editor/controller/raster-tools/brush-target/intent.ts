import type { Canvas, FabricObject } from 'fabric';
import { translate } from '../../../../platform/i18n';
import { isEditableObject } from '../../../document/model';
import { isImageLayerStyleObject } from '../../../objects/image-style';
import { createRasterTargetSnapshot } from '../../raster/target';
import { createBrushLayerSnapshot } from '../brush-layer';
import type { RasterToolBindings } from '../shared';
import { isLockedBaseImageTarget } from './locked-target';
import type { BrushTargetIntent } from './types';

export async function resolveBrushTargetIntent(
  bindings: RasterToolBindings,
  canvas: Canvas,
  fallbackTarget?: FabricObject | null
): Promise<BrushTargetIntent> {
  const activeObjects = canvas.getActiveObjects();
  if (activeObjects.length > 1) {
    return { kind: 'blocked' };
  }

  const target = fallbackTarget ?? activeObjects[0] ?? null;
  if (!target || !isEditableObject(target) || target.visible === false) {
    return createBrushLayerIntent(bindings);
  }

  if (target.sniptaleLocked && !isLockedBaseImageTarget(target)) {
    return { kind: 'blocked' };
  }

  if (isImageLayerStyleObject(target)) {
    return {
      kind: 'existing',
      object: target,
      snapshot: await createRasterTargetSnapshot({
        object: target,
        reference: {
          kind: 'object',
          objectId: target.sniptaleId ?? crypto.randomUUID(),
          objectName: target.sniptaleLabel ?? translate('editor.runtime.image'),
        },
      }),
    };
  }

  return createBrushLayerIntent(bindings);
}

function createBrushLayerIntent(
  bindings: RasterToolBindings
): Extract<BrushTargetIntent, { kind: 'create' }> {
  return {
    kind: 'create',
    snapshot: createBrushLayerSnapshot(bindings),
  };
}
