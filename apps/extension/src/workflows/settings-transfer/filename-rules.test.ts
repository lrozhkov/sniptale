import { expect, it } from 'vitest';
import { parseSettingsTransferDomains } from './domain-parser';
import { SETTINGS_TRANSFER_REGISTRY } from './registry';
it('roundtrips category rules in the saving transfer domain and exposes selection', () => {
  const payload = {
    'capture.saving': {
      schemaVersion: 1,
      data: { filenameRules: { template: 'Project_{type}', images: 'Shot_{date}' } },
    },
  };
  expect(parseSettingsTransferDomains(payload)).toEqual(payload);
  expect(
    SETTINGS_TRANSFER_REGISTRY.some((node) => node.id === 'capture.saving.filenameRules')
  ).toBe(true);
});
it.each([null, { template: '{unsupported}' }, { template: 'ok', documents: 123 }])(
  'refuses invalid imported rules before apply',
  (filenameRules) => {
    expect(() =>
      parseSettingsTransferDomains({
        'capture.saving': { schemaVersion: 1, data: { filenameRules } },
      })
    ).toThrow();
  }
);
