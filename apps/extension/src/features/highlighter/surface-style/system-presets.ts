import { createSolidPaint } from '@sniptale/foundation/paint';
import type { SurfaceStylePreset } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { cloneSurfaceStylePreset } from './operations';

export const SYSTEM_SURFACE_STYLE_CATALOG_REVISION = 1;

const systemPresets: readonly SurfaceStylePreset[] = [
  {
    id: 'system-surface-plain',
    name: 'surfaceStyle.system.plain',
    origin: 'system',
    style: { fillPaint: createSolidPaint('#ffffffff'), surfaceCss: '' },
  },
  {
    id: 'system-surface-frosted-light',
    name: 'surfaceStyle.system.frostedLight',
    origin: 'system',
    style: {
      fillPaint: createSolidPaint('#ffffffb8'),
      surfaceCss: 'backdrop-filter: blur(16px) saturate(1.2) brightness(1.04);',
    },
  },
  {
    id: 'system-surface-frosted-dark',
    name: 'surfaceStyle.system.frostedDark',
    origin: 'system',
    style: {
      fillPaint: createSolidPaint('#0f172acc'),
      surfaceCss: 'backdrop-filter: blur(16px) saturate(1.15) brightness(0.92);\ncolor: #f8fafcff;',
    },
  },
  {
    id: 'system-surface-clear-tint',
    name: 'surfaceStyle.system.clearTint',
    origin: 'system',
    style: {
      fillPaint: {
        kind: 'gradient',
        gradient: {
          type: 'linear',
          angle: 135,
          interpolation: 'oklab',
          repeat: { enabled: false, span: 1 },
          stops: [
            { id: 'clear-tint-start', color: '#60a5fa38', position: 0, midpoint: 0.5 },
            { id: 'clear-tint-end', color: '#a78bfa2e', position: 1, midpoint: 0.5 },
          ],
        },
      },
      surfaceCss:
        'backdrop-filter: blur(10px) saturate(1.25);\nbox-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);',
    },
  },
  {
    id: 'system-surface-soft-elevated',
    name: 'surfaceStyle.system.softElevated',
    origin: 'system',
    style: {
      fillPaint: createSolidPaint('#fffaf6fa'),
      surfaceCss:
        'box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.1);',
    },
  },
];

export function getSystemSurfaceStylePresets(): SurfaceStylePreset[] {
  return systemPresets.map(cloneSurfaceStylePreset);
}
