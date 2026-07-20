import { isEditorRichShapeFamily, type EditorRichShapeFamily } from './catalog/families';
import {
  DEFAULT_RICH_SHAPE_ROUGH,
  DEFAULT_RICH_SHAPE_STYLE,
  DEFAULT_RICH_SHAPE_TEXT,
} from './defaults';
import { normalizeRough } from './rough';
import { normalizeSource } from './source';
import { normalizeStyle } from './style';
import { normalizeText } from './text';
import type {
  EditorRichShapeRoughStyle,
  EditorRichShapeSourceMetadata,
  EditorRichShapeStyle,
  EditorRichShapeTextState,
} from './types';
import { isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

export interface EditorCustomShapeImportMetadata {
  sourceIds: readonly string[];
  groupIds: readonly string[];
  elementTypes: readonly string[];
  textContent: string | null;
}

export interface EditorCustomShapeRichShapeDefaults {
  shapeFamily?: EditorRichShapeFamily;
  shapeKind?: string;
  style?: EditorRichShapeStyle;
  text?: EditorRichShapeTextState;
  rough?: EditorRichShapeRoughStyle;
  source?: EditorRichShapeSourceMetadata;
}

function parseStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter(isString) : [];
}

export function normalizeEditorCustomShapeImportMetadata(
  value: unknown
): EditorCustomShapeImportMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    sourceIds: parseStringArray(value['sourceIds']),
    groupIds: parseStringArray(value['groupIds']),
    elementTypes: parseStringArray(value['elementTypes']),
    textContent:
      value['textContent'] === null || isString(value['textContent']) ? value['textContent'] : null,
  };
}

export function normalizeEditorCustomShapeRichShapeDefaults(
  value: unknown
): EditorCustomShapeRichShapeDefaults | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const defaults: EditorCustomShapeRichShapeDefaults = {};
  if (isEditorRichShapeFamily(value['shapeFamily'])) {
    defaults.shapeFamily = value['shapeFamily'];
  }
  if (isString(value['shapeKind'])) {
    defaults.shapeKind = value['shapeKind'];
  }
  if (isRecord(value['style'])) {
    defaults.style = normalizeStyle({
      ...DEFAULT_RICH_SHAPE_STYLE,
      ...value['style'],
      line: {
        ...DEFAULT_RICH_SHAPE_STYLE.line,
        ...(isRecord(value['style']['line']) ? value['style']['line'] : {}),
      },
    });
  }
  if (isRecord(value['text'])) {
    defaults.text = normalizeText({ ...DEFAULT_RICH_SHAPE_TEXT, ...value['text'] });
  }
  if (isRecord(value['rough'])) {
    defaults.rough = normalizeRough({ ...DEFAULT_RICH_SHAPE_ROUGH, ...value['rough'] });
  }
  if (isRecord(value['source'])) {
    defaults.source = normalizeSource(value['source']);
  }

  return Object.keys(defaults).length > 0 ? defaults : undefined;
}
