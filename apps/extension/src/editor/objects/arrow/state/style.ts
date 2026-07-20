import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import { hexToRgba } from '../../../document/model';
import { resolveLineDashArray } from '../../line/path';
import { createFabricShadow } from '../../shadow';

export function createArrowPathStyle(
  settings: EditorArrowSettings,
  lineStyle: NonNullable<EditorArrowSettings['style']>
) {
  return {
    fill: lineStyle === 'solid' ? hexToRgba(settings.color, settings.opacity) : 'transparent',
    stroke: lineStyle === 'solid' ? 'transparent' : hexToRgba(settings.color, settings.opacity),
    strokeWidth: lineStyle === 'solid' ? 0 : Math.max(1, settings.width),
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    objectCaching: false,
    shadow: createFabricShadow(settings.shadow, settings.shadowColor ?? settings.color, {
      angle: settings.shadowAngle ?? 90,
      blur: settings.shadowBlur ?? 12,
      distance: settings.shadowDistance ?? 4,
    }),
    strokeDashArray: resolveLineDashArray({
      ...settings,
      style: lineStyle,
      corners: 'round',
      roughness: settings.roughness ?? 0,
      bowing: settings.bowing ?? 0,
      fillMode: 'none',
      fillColor: '#ffffff',
      fillOpacity: 0,
      gradientFrom: '#ffffff',
      gradientTo: '#ffffff',
      gradientAngle: 0,
      roughFillStyle: 'hachure',
      roughFillColor: '#ffffff',
      roughFillGap: 8,
      roughFillAngle: -41,
      roughFillWeight: 1,
      roughFillRoughness: 1,
      roughFillBowing: 1,
      roughFillOpacity: 0.2,
    }),
  };
}
