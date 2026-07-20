import type {
  EditorRichShapeDocumentObject,
  EditorRichShapeStyle,
} from '../../../features/editor/document/rich-shape';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';

export function createCalloutEffects(
  baseShape: EditorRichShapeDocumentObject,
  settings: EditorToolSettings['callout']
) {
  return {
    ...baseShape.effects,
    shadow: {
      ...baseShape.effects.shadow,
      enabled: settings.style.shadow > 0,
      opacity: settings.style.shadow > 0 ? 0.28 : 0,
      blur: settings.style.shadowBlur ?? baseShape.effects.shadow.blur,
      color: settings.style.shadowColor ?? settings.style.strokeColor,
      angle: settings.style.shadowAngle ?? baseShape.effects.shadow.angle,
      distance: settings.style.shadowDistance ?? baseShape.effects.shadow.distance,
    },
  };
}

export function createCalloutStyle(
  baseShape: EditorRichShapeDocumentObject,
  settings: EditorToolSettings['callout']
): EditorRichShapeStyle {
  return {
    ...baseShape.style,
    fill: { type: 'solid' as const, color: settings.style.fillColor },
    fillTransparency: 1 - settings.style.fillOpacity,
    line: {
      ...baseShape.style.line,
      color: settings.style.strokeColor,
      dashStyle: resolveCalloutDashStyle(settings.style.strokeStyle),
      transparency: 1 - settings.style.strokeOpacity,
      width: settings.style.strokeWidth,
    },
    opacity: settings.style.opacity,
    cornerRadius: settings.style.radius,
  };
}

function resolveCalloutDashStyle(style: EditorToolSettings['callout']['style']['strokeStyle']) {
  return style === 'dotted' ? 'dot' : style === 'dashed' ? 'dash' : 'solid';
}
