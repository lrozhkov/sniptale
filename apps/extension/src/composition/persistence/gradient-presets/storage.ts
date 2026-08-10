import { browserStorage } from '../infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { GRADIENT_PRESET_STORAGE_KEY, type GradientPresetCatalog } from './contracts';
import { cloneGradientPresetCatalog } from './defaults';
import { parseGradientPresetCatalog } from './parser';

export async function readGradientPresetCatalog() {
  const result = await browserStorage.sync.get([GRADIENT_PRESET_STORAGE_KEY]);
  return parseGradientPresetCatalog(result[GRADIENT_PRESET_STORAGE_KEY]);
}
export async function writeGradientPresetCatalog(
  catalog: GradientPresetCatalog,
  permit: PersistenceMutationPermit
): Promise<void> {
  await browserStorage.sync.set(
    { [GRADIENT_PRESET_STORAGE_KEY]: cloneGradientPresetCatalog(catalog) },
    permit
  );
}
