import { FabricImage, type FabricObject } from 'fabric';
import type { EditorTextSettings } from '../../../features/editor/document/types';
import {
  getEditorBuiltInShapeEntry,
  type EditorBuiltInShapeCatalogEntry,
} from '../../../features/editor/document/rich-shape';
import { formatDateTime, getCurrentLocale, translate } from '../../../platform/i18n';
import { createObjectLabel } from '../../document/model';
import { getBrowserVersion } from '../core/helpers';
import { createMetaStamp } from '../../objects/annotation/text';
import { createRichShapeCatalogObject } from '../../objects/rich-shape';

import type { SourceState } from '../../document/model/source-state';
import { type EditorTechnicalDataKind } from './technical-data';
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

export function createMetaStampObject(options: {
  kind: EditorTechnicalDataKind;
  source: SourceState;
  sourceUrl: string;
  sourceTitle: string;
  nextLabelIndex: number;
  textSettings: EditorTextSettings;
  prepareObject: (object: FabricObject) => void;
}): FabricObject {
  const locale = getCurrentLocale();
  const rawValue =
    options.kind === 'url'
      ? options.sourceUrl || 'https://example.com'
      : options.kind === 'date'
        ? formatDateTime(new Date(), { dateStyle: 'medium', timeStyle: 'short' }, locale)
        : getBrowserVersion();
  const value =
    options.kind === 'url'
      ? `${translate('editor.runtime.metaStampUrlLabel', locale)}\n${rawValue}`
      : options.kind === 'date'
        ? `${translate('editor.runtime.metaStampDateLabel', locale)}\n${rawValue}`
        : `${translate('editor.runtime.metaStampBrowserLabel', locale)}\n${rawValue}${
            options.sourceTitle
              ? `\n${translate('editor.runtime.metaStampPageLabel', locale)}: ${options.sourceTitle}`
              : ''
          }`;

  const stamp = createMetaStamp(
    options.kind,
    value,
    options.source.left + 20,
    options.source.top + options.source.displayHeight - 48,
    options.nextLabelIndex,
    options.textSettings
  );
  options.prepareObject(stamp);
  return stamp;
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
