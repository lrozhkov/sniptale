import type { SurfaceStylePreset } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { cloneSurfaceStylePreset } from './operations';
import { getShowcaseSurface, SHOWCASE_SURFACE_IDS } from '../showcase-resources';

export const SYSTEM_SURFACE_STYLE_CATALOG_REVISION = 3;

const systemPresets: readonly SurfaceStylePreset[] = SHOWCASE_SURFACE_IDS.map((id) => ({
  id,
  name: `surfaceStyle.system.${id.replace('system-surface-', '')}`,
  origin: 'system',
  style: getShowcaseSurface(id),
}));

export function getSystemSurfaceStylePresets(): SurfaceStylePreset[] {
  return systemPresets.map(cloneSurfaceStylePreset);
}
