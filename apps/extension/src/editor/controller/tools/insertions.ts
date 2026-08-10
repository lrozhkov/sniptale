import { FabricImage, type FabricObject } from 'fabric';
import {
  getEditorBuiltInShapeEntry,
  type EditorBuiltInShapeCatalogEntry,
} from '../../../features/editor/document/rich-shape';
import { createObjectLabel } from '../../document/model';
import { createRichShapeCatalogObject } from '../../objects/rich-shape';

import type { SourceState } from '../../document/model/source-state';
export { createTechnicalDataTextObject } from './technical-data-insertion/factory';

export async function createInsertedImageObject(options: {
  dataUrl: string;
  name: string | null;
  source: SourceState;
  canvasWidth: number;
  canvasHeight: number;
  nextLabelIndex: number;
  prepareObject: (object: FabricObject) => void;
}): Promise<FabricObject> {
  const image = await FabricImage.fromURL(options.dataUrl);

  image.set({
    left: options.source.left + 40,
    top: options.source.top + 40,
    scaleX: 1,
    scaleY: 1,
    originX: 'left',
    originY: 'top',
  });

  image.sniptaleId = crypto.randomUUID();
  image.sniptaleType = 'image';
  image.sniptaleRole = 'annotation';
  image.sniptaleLabel = options.name || createObjectLabel('image', options.nextLabelIndex);

  options.prepareObject(image);
  return image;
}

export function createRichShapeCatalogInsertionObject(options: {
  shapeId: string;
  source: SourceState;
  nextLabelIndex: number;
  prepareObject: (object: FabricObject) => void;
}): FabricObject | null {
  const entry: EditorBuiltInShapeCatalogEntry | undefined = getEditorBuiltInShapeEntry(
    options.shapeId
  );
  if (!entry) {
    return null;
  }

  const object = createRichShapeCatalogObject({
    entry,
    id: crypto.randomUUID(),
    labelIndex: options.nextLabelIndex,
    left: options.source.left + 40,
    top: options.source.top + 40,
  });
  options.prepareObject(object);
  return object;
}
