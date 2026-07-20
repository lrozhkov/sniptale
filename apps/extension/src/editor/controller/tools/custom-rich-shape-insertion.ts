import type { FabricObject } from 'fabric';
import {
  createDefaultRichShapeObject,
  EDITOR_RICH_SHAPE_FAMILY,
  type EditorRichShapeDocumentObject,
  type EditorRichShapeSourceMetadata,
} from '../../../features/editor/document/rich-shape';
import {
  normalizeEditorCustomShapeDefinition,
  type EditorCustomShapeDefinition,
} from '../../../features/editor/document/rich-shape/custom';
import { createRichShapeObject } from '../../objects/rich-shape';

import type { SourceState } from '../../document/model/source-state';

function createCustomRichShapeDocumentObject(options: {
  definition: EditorCustomShapeDefinition;
  height?: number;
  id: string;
  left: number;
  rough?: boolean;
  top: number;
  width?: number;
}): EditorRichShapeDocumentObject {
  const base = createDefaultRichShapeObject();
  const defaults = options.definition.richShapeDefaults;
  const fallbackSource: EditorRichShapeSourceMetadata = {
    formatVersion: '1',
    importedAt: new Date().toISOString(),
    itemId: options.definition.id,
    libraryId: null,
    name: options.definition.label,
    type: 'custom' as const,
  };
  const source = defaults?.source ?? options.definition.source ?? fallbackSource;
  const rough = options.rough
    ? { ...base.rough, enabled: true, ...options.definition.roughDefaults, ...defaults?.rough }
    : (defaults?.rough ?? base.rough);
  return createDefaultRichShapeObject({
    id: options.id,
    shapeFamily: defaults?.shapeFamily ?? EDITOR_RICH_SHAPE_FAMILY.CUSTOM,
    shapeKind: defaults?.shapeKind ?? options.definition.id,
    frame: {
      height: Math.max(1, options.height ?? options.definition.geometry.viewBox.height),
      left: options.left,
      top: options.top,
      width: Math.max(1, options.width ?? options.definition.geometry.viewBox.width),
    },
    ...(defaults?.style ? { style: defaults.style } : {}),
    ...(defaults?.text ? { text: defaults.text } : {}),
    geometry: options.definition.geometry,
    rough,
    source,
  });
}

export function createCustomRichShapeInsertionObject(options: {
  shapeId: string;
  customDefinition?: unknown;
  source: SourceState;
  nextLabelIndex: number;
  prepareObject: (object: FabricObject) => void;
  rough?: boolean;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}): FabricObject | null {
  const definition = normalizeEditorCustomShapeDefinition(options.customDefinition);
  if (!definition || definition.id !== options.shapeId) {
    return null;
  }

  const shape = createCustomRichShapeDocumentObject({
    definition,
    id: crypto.randomUUID(),
    left: options.left ?? options.source.left + 40,
    top: options.top ?? options.source.top + 40,
    ...(options.height === undefined ? {} : { height: options.height }),
    ...(options.rough === undefined ? {} : { rough: options.rough }),
    ...(options.width === undefined ? {} : { width: options.width }),
  });
  const object = createRichShapeObject(
    shape,
    definition.geometry,
    `${definition.label} ${options.nextLabelIndex}`
  );
  if (!object) {
    return null;
  }

  options.prepareObject(object);
  return object;
}
