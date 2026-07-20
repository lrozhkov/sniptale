import type { EditorObjectType, EditorShapeSettings } from '../types';
import { EDITOR_RICH_SHAPE_FAMILY } from './catalog/families';
import {
  DEFAULT_RICH_SHAPE_EFFECTS,
  DEFAULT_RICH_SHAPE_ROUGH,
  DEFAULT_RICH_SHAPE_TEXT,
} from './defaults';
import { EDITOR_RICH_SHAPE_OBJECT_TYPE } from './types';
import type { EditorRichShapeDocumentObject, EditorRichShapeFrame } from './types';

export type LegacyEditorRichShapeKind = Extract<
  EditorObjectType,
  'rectangle' | 'ellipse' | 'diamond'
>;

function resolveShadow(settings: EditorShapeSettings) {
  return {
    ...DEFAULT_RICH_SHAPE_EFFECTS.shadow,
    enabled: settings.shadow > 0,
    opacity: settings.shadow > 0 ? Math.min(1, settings.shadow / 100) : 0,
  };
}

function resolveDashStyle(
  settings: EditorShapeSettings
): EditorRichShapeDocumentObject['style']['line']['dashStyle'] {
  if (settings.strokeStyle === 'dashed') {
    return 'dash';
  }
  if (settings.strokeStyle === 'dotted') {
    return 'dot';
  }

  return 'solid';
}

export function createRichShapeFromLegacyShapeSettings(options: {
  id: string;
  kind: LegacyEditorRichShapeKind;
  frame: EditorRichShapeFrame;
  settings: EditorShapeSettings;
  label?: string | null;
}): EditorRichShapeDocumentObject {
  return {
    id: options.id,
    objectType: EDITOR_RICH_SHAPE_OBJECT_TYPE,
    shapeFamily: EDITOR_RICH_SHAPE_FAMILY.OFFICE,
    shapeKind: options.kind,
    frame: options.frame,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    style: createLegacyRichShapeStyle(options.kind, options.settings),
    effects: {
      ...DEFAULT_RICH_SHAPE_EFFECTS,
      shadow: resolveShadow(options.settings),
    },
    text: { ...DEFAULT_RICH_SHAPE_TEXT },
    rough: { ...DEFAULT_RICH_SHAPE_ROUGH },
    source: createLegacyRichShapeSource(options.kind, options.label),
    layer: createVisibleLegacyRichShapeLayer(),
  };
}

function createLegacyRichShapeStyle(
  kind: LegacyEditorRichShapeKind,
  settings: EditorShapeSettings
): EditorRichShapeDocumentObject['style'] {
  return {
    fill: { type: 'solid', color: settings.fillColor },
    fillTransparency: 1 - settings.fillOpacity,
    line: {
      color: settings.strokeColor,
      transparency: 1 - settings.strokeOpacity,
      width: settings.strokeWidth,
      dashStyle: resolveDashStyle(settings),
      cap: 'round',
      join: 'round',
      beginArrowhead: 'none',
      endArrowhead: 'none',
    },
    opacity: settings.opacity,
    cornerRadius: kind === 'rectangle' ? settings.radius : 0,
  };
}

function createLegacyRichShapeSource(
  kind: LegacyEditorRichShapeKind,
  label?: string | null
): NonNullable<EditorRichShapeDocumentObject['source']> {
  return {
    type: 'built-in',
    name: label ?? kind,
    libraryId: null,
    itemId: null,
    importedAt: null,
    formatVersion: null,
  };
}

function createVisibleLegacyRichShapeLayer(): EditorRichShapeDocumentObject['layer'] {
  return {
    visible: true,
    locked: false,
    zIndex: null,
  };
}
