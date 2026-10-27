import type { AIConnectionReason } from '../../contracts/settings/ai-catalog';
import type { TranslationKey } from '../../platform/i18n';

const PROVIDER_FAILURE_COPY: Partial<Record<AIConnectionReason, TranslationKey>> = {
  'invalid-credential': 'settings.aiProviders.providerStatusInvalidKey',
  'permission-denied': 'settings.aiProviders.providerStatusDenied',
  'model-unavailable': 'settings.aiProviders.providerStatusModelUnavailable',
  'quota-exceeded': 'settings.aiProviders.providerStatusQuota',
  'rate-limited': 'settings.aiProviders.providerStatusRate',
  network: 'settings.aiProviders.providerStatusNetwork',
  timeout: 'settings.aiProviders.providerStatusTimeout',
  'service-error': 'settings.aiProviders.providerStatusUnavailable',
  'host-permission-required': 'settings.aiProviders.providerStatusPermission',
  'secret-locked': 'settings.aiProviders.providerStatusLocked',
  'provider-unavailable': 'settings.aiProviders.providerStatusUnavailable',
};

/** Gallery owns fixed local copy. Missing or ambiguous evidence keeps the existing fallback. */
export function getReviewAIProviderFailureKey(
  reason: AIConnectionReason | null
): TranslationKey | undefined {
  return reason ? PROVIDER_FAILURE_COPY[reason] : undefined;
}
