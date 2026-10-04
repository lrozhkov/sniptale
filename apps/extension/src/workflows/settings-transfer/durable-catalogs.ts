import type { SettingsTransferDomainPayload } from '../../contracts/settings-transfer';
import { parseGradientPresetCatalog } from '../../composition/persistence/gradient-presets/parser';
import { parseStoredSurfaceStylePresetState } from '../../composition/persistence/surface-style-presets/parser';
import { failSettingsTransferDomain } from './domain-error';
import { asSettingsRecord as asRecord } from './json-value';
import { hasOnlyKnownFavoriteIds, normalizeSurfaceCatalogForParsing } from './style-domain-parser';

export function assertDurableSettingsTransferCatalogs(
  domains: Record<string, SettingsTransferDomainPayload>
): void {
  const gradients = domains['styles.gradients'];
  if (gradients) {
    const value = asRecord(gradients.data);
    const parsed = parseGradientPresetCatalog(value);
    if (
      parsed.unsafeForWrite ||
      !hasOnlyKnownFavoriteIds(value['favoriteIdsBySurface'], presetIds(value['presets']))
    )
      failSettingsTransferDomain('styles.gradients');
  }
  const surfaces = domains['styles.surfaces'];
  if (surfaces) {
    const value = asRecord(surfaces.data);
    const parsed = parseStoredSurfaceStylePresetState(normalizeSurfaceCatalogForParsing(value));
    if (
      !parsed.stored ||
      parsed.catalog.unsafeForWrite ||
      !hasOnlyKnownFavoriteIds(value['favoriteIds'], presetIds(value['presets']))
    )
      failSettingsTransferDomain('styles.surfaces');
  }
}

function presetIds(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value.flatMap((preset) => {
      const id = asRecord(preset)['id'];
      return typeof id === 'string' ? [id] : [];
    })
  );
}
