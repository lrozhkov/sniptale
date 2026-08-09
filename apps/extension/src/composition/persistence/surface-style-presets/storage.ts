import { browserStorage } from '../infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  SURFACE_STYLE_PRESET_MAX_BYTES,
  SURFACE_STYLE_PRESET_STORAGE_KEY,
  type SurfaceStylePresetCatalog,
} from './contracts';
import { parseStoredSurfaceStylePresetState, serializeSurfaceStylePresetCatalog } from './parser';

export class SurfaceStylePresetQuotaError extends Error {}

export async function readSurfaceStylePresetCatalog() {
  const result = await browserStorage.sync.get([SURFACE_STYLE_PRESET_STORAGE_KEY]);
  return parseStoredSurfaceStylePresetState(result[SURFACE_STYLE_PRESET_STORAGE_KEY]);
}

export async function writeSurfaceStylePresetCatalog(
  catalog: SurfaceStylePresetCatalog,
  permit: PersistenceMutationPermit
) {
  const payload = {
    [SURFACE_STYLE_PRESET_STORAGE_KEY]: serializeSurfaceStylePresetCatalog(catalog),
  };
  if (
    new TextEncoder().encode(JSON.stringify(payload)).byteLength > SURFACE_STYLE_PRESET_MAX_BYTES
  ) {
    throw new SurfaceStylePresetQuotaError('Surface Style preset storage quota exceeded');
  }
  await browserStorage.sync.set(payload, permit);
}
