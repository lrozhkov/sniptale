import { expect, it } from 'vitest';
import type { SettingsTransferDomainPayload } from '../../contracts/settings-transfer';
import { isCompleteSettingsTransferBackup } from './backup';
import { SETTINGS_TRANSFER_DOMAIN_IDS } from './registry';
import { createSystemViewportPresetCatalog } from '../../features/viewport-presets/catalog';
import { cloneSettingsTransferJsonValue } from '../../contracts/settings-transfer';

it('requires every canonical domain and every current transfer surface for exact restore', () => {
  const current = domainsFixture();
  const complete = domainsFixture();
  expect(isCompleteSettingsTransferBackup({ imported: complete, current })).toBe(true);

  const { 'capture.image': _missingDomain, ...withoutDomain } = complete;
  expect(isCompleteSettingsTransferBackup({ imported: withoutDomain, current })).toBe(false);

  const withoutField = structuredClone(complete);
  withoutField['capture.image'] = { schemaVersion: 1, data: {} };
  expect(isCompleteSettingsTransferBackup({ imported: withoutField, current })).toBe(false);

  const partialViewport = structuredClone(complete);
  partialViewport['capture.viewport-presets'] = {
    schemaVersion: 1,
    data: { visibleSurface: 'capture.viewport-presets', items: [] },
  };
  expect(isCompleteSettingsTransferBackup({ imported: partialViewport, current })).toBe(false);
});

function domainsFixture(): Record<string, SettingsTransferDomainPayload> {
  return Object.fromEntries(
    SETTINGS_TRANSFER_DOMAIN_IDS.map((domainId) => [
      domainId,
      {
        schemaVersion: 1,
        data: {
          visibleSurface: domainId,
          ...(domainId === 'capture.viewport-presets'
            ? { items: cloneSettingsTransferJsonValue(createSystemViewportPresetCatalog()) }
            : {}),
        },
      },
    ])
  );
}
