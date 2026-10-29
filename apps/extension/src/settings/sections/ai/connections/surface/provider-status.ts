import type { AIProvider } from '../../../../../contracts/settings';
import type { AIConnectionReason } from '../../../../../contracts/settings/ai-catalog';
import { translate, type TranslationKey } from '../../../../../platform/i18n';

const FAILURE_COPY: Record<AIConnectionReason, TranslationKey> = {
  'invalid-credential': 'settings.aiProviders.providerStatusInvalidKey',
  'host-permission-required': 'settings.aiProviders.providerStatusPermission',
  'permission-denied': 'settings.aiProviders.providerStatusDenied',
  'model-unavailable': 'settings.aiProviders.providerStatusModelUnavailable',
  'quota-exceeded': 'settings.aiProviders.providerStatusQuota',
  'rate-limited': 'settings.aiProviders.providerStatusRate',
  network: 'settings.aiProviders.providerStatusNetwork',
  timeout: 'settings.aiProviders.providerStatusTimeout',
  'service-error': 'settings.aiProviders.providerStatusUnavailable',
  unknown: 'settings.aiProviders.providerStatusUnverified',
  'secret-locked': 'settings.aiProviders.providerStatusLocked',
  'catalog-unsupported': 'settings.aiProviders.providerStatusNoCatalog',
  'provider-unavailable': 'settings.aiProviders.providerStatusUnavailable',
};
export function providerStatus(provider: AIProvider): string {
  const observation = provider.observation;
  if (!observation || observation.revision !== provider.revision)
    return translate('settings.aiProviders.providerStatusUnverified');
  if (observation.reason) return translate(FAILURE_COPY[observation.reason]);
  if (observation.status === 'available')
    return translate(
      observation.scope === 'operation'
        ? 'settings.aiProviders.providerStatusOperation'
        : observation.scope === 'credentials'
          ? 'settings.aiProviders.providerStatusCredentials'
          : 'settings.aiProviders.providerStatusCatalog'
    );
  return translate(
    observation.status === 'locked'
      ? 'settings.aiProviders.providerStatusLocked'
      : observation.status === 'permission-required'
        ? 'settings.aiProviders.providerStatusPermission'
        : observation.status === 'unverified'
          ? 'settings.aiProviders.providerStatusUnverified'
          : 'settings.aiProviders.providerStatusUnavailable'
  );
}
