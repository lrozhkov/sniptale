import {
  createDefaultRichShapeObject,
  createEnabledRichShapeRoughStyle,
  type EditorBuiltInShapeCatalogEntry,
  type EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';
import { createDefaultRichShapeStyle } from './style/defaults';
import { createRichShapeObject } from './object';
import type { RichShapeGroup } from './types';

function withLineDefaults(
  entry: EditorBuiltInShapeCatalogEntry,
  shape: EditorRichShapeDocumentObject
): EditorRichShapeDocumentObject {
  const style = createDefaultRichShapeStyle();
  const isLineLike = ['line', 'arrow', 'connector'].includes(entry.insertDefaults.shapeFamily);
  style.fill = { type: 'solid', color: '#ffffff' };
  style.fillTransparency = isLineLike ? 1 : entry.insertDefaults.style.fillTransparency;
  style.line.color = entry.insertDefaults.style.lineColor;
  style.line.width = entry.insertDefaults.style.lineWidth;

  if (entry.id === 'arrow' || entry.id === 'left-line-arrow') {
    style.line.endArrowhead = entry.id === 'arrow' ? 'triangle' : 'none';
    style.line.beginArrowhead = entry.id === 'left-line-arrow' ? 'triangle' : 'none';
  } else if (entry.id === 'double-line-arrow') {
    style.line.beginArrowhead = 'triangle';
    style.line.endArrowhead = 'triangle';
  }

  return { ...shape, style };
}

export function createRichShapeDocumentObjectFromCatalog(options: {
  entry: EditorBuiltInShapeCatalogEntry;
  id: string;
  labelIndex: number;
  left: number;
  rough?: boolean;
  height?: number;
  top: number;
  width?: number;
}): EditorRichShapeDocumentObject {
  const defaults = options.entry.insertDefaults;
  const baseShape = createDefaultRichShapeObject();
  const shape = createDefaultRichShapeObject({
    effects: {
      ...baseShape.effects,
      shadow: {
        ...baseShape.effects.shadow,
        enabled: defaults.effects.shadowEnabled,
      },
    },
    frame: {
      height: Math.max(1, options.height ?? defaults.frame.height),
      left: options.left,
      top: options.top,
      width: Math.max(1, options.width ?? defaults.frame.width),
    },
    id: options.id,
    rough: options.rough ? createEnabledRichShapeRoughStyle(options.id) : baseShape.rough,
    shapeFamily: defaults.shapeFamily,
    shapeKind: defaults.shapeKind,
    source: {
      formatVersion: '1',
      importedAt: null,
      itemId: options.entry.id,
      libraryId: null,
      name: options.entry.labelFallback,
      type: 'built-in',
    },
    text: {
      ...baseShape.text,
      content: defaults.text.content,
      fontSize: defaults.text.fontSize,
      horizontalAlign: defaults.text.horizontalAlign,
      verticalAlign: defaults.text.verticalAlign,
    },
  });

  return withLineDefaults(options.entry, shape);
}

export function createRichShapeCatalogObject(options: {
  entry: EditorBuiltInShapeCatalogEntry;
  id: string;
  labelIndex: number;
  left: number;
  rough?: boolean;
  height?: number;
  top: number;
  width?: number;
}): RichShapeGroup {
  const shape = createRichShapeDocumentObjectFromCatalog(options);
  const label = `${options.entry.labelFallback} ${options.labelIndex}`;
  const object = createRichShapeObject(shape, options.entry.geometry, label);
  if (!object) {
    throw new Error(`Unsupported rich shape geometry: ${options.entry.id}`);
  }
  return object;
}
