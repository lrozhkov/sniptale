import { FabricImage } from 'fabric';
import { translate } from '../../../platform/i18n';
import { canvasToRasterDataUrl, createRasterCanvas } from '../raster/bitmap';
import type { EditorRasterTargetSnapshot } from '../raster/types';
import type { RasterToolBindings } from './shared';

export function createBrushLayerSnapshot(
  bindings: Pick<RasterToolBindings, 'getCanvasDocumentSize' | 'nextLabelIndex'>
): EditorRasterTargetSnapshot {
  const size = bindings.getCanvasDocumentSize();
  const label = `${translate('editor.runtime.brush')} ${bindings.nextLabelIndex('image')}`;

  return {
    bitmap: createRasterCanvas(size.width, size.height),
    reference: {
      kind: 'object',
      objectId: crypto.randomUUID(),
      objectName: label,
    },
    sceneBounds: {
      left: 0,
      top: 0,
      width: size.width,
      height: size.height,
    },
  };
}

export async function insertBrushLayer(
  bindings: Pick<RasterToolBindings, 'addObject'>,
  snapshot: EditorRasterTargetSnapshot
): Promise<void> {
  const image = await FabricImage.fromURL(canvasToRasterDataUrl(snapshot.bitmap));
  image.set({
    left: snapshot.sceneBounds.left,
    originX: 'left',
    originY: 'top',
    top: snapshot.sceneBounds.top,
  });
  image.sniptaleId = snapshot.reference.objectId;
  image.sniptaleLabel = snapshot.reference.objectName;
  image.sniptaleRole = 'annotation';
  image.sniptaleType = 'image';
  image.sniptaleEffects = [];
  bindings.addObject(image);
}
