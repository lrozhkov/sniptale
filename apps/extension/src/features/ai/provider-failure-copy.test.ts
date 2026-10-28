import { expect, it } from 'vitest';
import { getAIProviderFailureKey } from './provider-failure-copy';
import type { AIConnectionReason } from '../../contracts/settings/ai-catalog';
import type { TranslationKey } from '../../platform/i18n';

it.each<[AIConnectionReason, TranslationKey]>([
  ['invalid-credential', 'settings.aiProviders.providerStatusInvalidKey'],
  ['permission-denied', 'settings.aiProviders.providerStatusDenied'],
  ['model-unavailable', 'settings.aiProviders.providerStatusModelUnavailable'],
  ['quota-exceeded', 'settings.aiProviders.providerStatusQuota'],
  ['rate-limited', 'settings.aiProviders.providerStatusRate'],
  ['network', 'settings.aiProviders.providerStatusNetwork'],
  ['timeout', 'settings.aiProviders.providerStatusTimeout'],
  ['service-error', 'settings.aiProviders.providerStatusUnavailable'],
  ['host-permission-required', 'settings.aiProviders.providerStatusPermission'],
  ['secret-locked', 'settings.aiProviders.providerStatusLocked'],
  ['provider-unavailable', 'settings.aiProviders.providerStatusUnavailable'],
])('selects fixed copy for %s', (reason, expected) => {
  expect(getAIProviderFailureKey(reason)).toBe(expected);
});

it.each([null, undefined, 'unknown'] as const)('retains the caller fallback for %j', (reason) => {
  expect(getAIProviderFailureKey(reason)).toBeUndefined();
});
