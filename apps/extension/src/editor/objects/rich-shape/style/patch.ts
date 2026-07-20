import type {
  EditorArrowSettings,
  EditorShapeSettings,
} from '../../../../features/editor/document/types';
import type {
  EditorRichShapeArrowhead,
  EditorRichShapeDocumentObject,
  EditorRichShapeStyle,
} from '../../../../features/editor/document/rich-shape';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { clampRichShapeOpacity } from '../opacity';

function mapArrowHead(value: EditorArrowSettings['startHead']): EditorRichShapeArrowhead {
  switch (value) {
    case 'circle':
    case 'circle-outline':
    case 'crosshair-circle':
      return 'oval';
    case 'bar':
    case 'block':
    case 'triangle':
    case 'triangle-outline':
      return 'triangle';
    case 'diamond-outline':
    case 'diamond':
      return 'diamond';
    case 'arrow':
    case 'open':
      return 'open';
    case 'none':
      return value;
  }
}

function createRichShapeStyleFromShapeSettings(
  current: EditorRichShapeStyle,
  settings: EditorShapeSettings
): EditorRichShapeStyle {
  return {
    ...current,
    fill: { type: 'solid', color: settings.fillColor },
    fillTransparency: 1 - clampRichShapeOpacity(settings.fillOpacity),
    line: {
      ...current.line,
      color: settings.strokeColor,
      dashStyle:
        settings.strokeStyle === 'dotted'
          ? 'dot'
          : settings.strokeStyle === 'dashed'
            ? 'dash'
            : 'solid',
      transparency: 1 - clampRichShapeOpacity(settings.strokeOpacity),
      width: settings.strokeWidth,
    },
    opacity: clampRichShapeOpacity(settings.opacity),
    cornerRadius: settings.radius,
  };
}

export function createRichShapeStyleFromArrowSettings(
  current: EditorRichShapeStyle,
  settings: EditorArrowSettings
): EditorRichShapeStyle {
  return {
    ...current,
    line: {
      ...current.line,
      beginArrowhead: mapArrowHead(settings.startHead),
      color: settings.color,
      endArrowhead: mapArrowHead(settings.endHead),
      transparency: 1 - clampRichShapeOpacity(settings.opacity),
      width: settings.width,
    },
    opacity: 1,
  };
}

export function createRichShapeStylePatch(
  shape: EditorRichShapeDocumentObject,
  settings: EditorToolSettings
): EditorRichShapeStyle {
  if (
    shape.shapeFamily === 'line' ||
    shape.shapeFamily === 'arrow' ||
    shape.shapeFamily === 'connector'
  ) {
    return createRichShapeStyleFromArrowSettings(shape.style, settings.arrow);
  }

  return createRichShapeStyleFromShapeSettings(shape.style, settings.rectangle);
}
