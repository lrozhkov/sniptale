import { expect, it } from 'vitest';
import type { AIProvider } from '../../../../../contracts/settings';
import { translate, type TranslationKey } from '../../../../../platform/i18n';
import { providerStatus } from './provider-status';

const provider: AIProvider = {
  id: 'provider',
  name: 'Connection',
  connectionType: 'neuraldeep',
  baseUrl: 'https://api.neuraldeep.ru/v1',
  hasStoredApiKey: true,
  createdAt: 1,
  revision: 2,
};
it('does not report an old credential observation as current', () => {
  expect(providerStatus(provider)).toBe(translate('settings.aiProviders.providerStatusUnverified'));
  expect(
    providerStatus({
      ...provider,
      observation: {
        revision: 1,
        scope: 'catalog',
        checkedAt: 1,
        status: 'available',
      },
    })
  ).toBe(translate('settings.aiProviders.providerStatusUnverified'));
});
it.each([
  ['operation', 'settings.aiProviders.providerStatusOperation'],
  ['credentials', 'settings.aiProviders.providerStatusCredentials'],
  ['catalog', 'settings.aiProviders.providerStatusCatalog'],
] as const)('describes only the proven scope: %s', (scope, key) => {
  expect(
    providerStatus({
      ...provider,
      observation: {
        revision: 2,
        scope,
        checkedAt: 1,
        status: 'available',
      },
    })
  ).toBe(translate(key));
});
it.each([
  ['locked', 'settings.aiProviders.providerStatusLocked'],
  ['permission-required', 'settings.aiProviders.providerStatusPermission'],
  ['unverified', 'settings.aiProviders.providerStatusUnverified'],
  ['unavailable', 'settings.aiProviders.providerStatusUnavailable'],
] as const)('describes recovery state: %s', (status, key) => {
  expect(
    providerStatus({
      ...provider,
      observation: {
        revision: 2,
        scope: 'catalog',
        checkedAt: 1,
        status,
      },
    })
  ).toBe(translate(key));
});
it('distinguishes invalid credentials from catalog availability', () => {
  const key: TranslationKey = 'settings.aiProviders.providerStatusInvalidKey';
  expect(
    providerStatus({
      ...provider,
      observation: {
        revision: 2,
        scope: 'catalog',
        checkedAt: 1,
        status: 'unavailable',
        reason: 'invalid-credential',
      },
    })
  ).toBe(translate(key));
});
