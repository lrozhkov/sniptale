import type { VoiceInputErrorCode } from '@sniptale/runtime-contracts/voice-input';
import type { TranslationKey } from '../../platform/i18n';

const PROVIDER_ERROR_COPY: Partial<Record<VoiceInputErrorCode, TranslationKey>> = {
  'provider-invalid-credential': 'settings.aiProviders.providerStatusInvalidKey',
  'provider-permission-denied': 'settings.aiProviders.providerStatusDenied',
  'provider-quota-exceeded': 'settings.aiProviders.providerStatusQuota',
  'provider-rate-limited': 'settings.aiProviders.providerStatusRate',
  'provider-service-error': 'settings.aiProviders.providerStatusUnavailable',
  'provider-host-permission-required': 'settings.aiProviders.providerStatusPermission',
  'provider-secret-locked': 'settings.aiProviders.providerStatusLocked',
  'provider-unavailable': 'settings.aiProviders.providerStatusUnavailable',
  'model-unavailable': 'settings.aiProviders.providerStatusModelUnavailable',
  network: 'settings.aiProviders.providerStatusNetwork',
  timeout: 'settings.aiProviders.providerStatusTimeout',
};

/** Selects fixed provider copy without changing microphone error or command policy. */
export function getVoiceInputProviderErrorKey(
  code: VoiceInputErrorCode | 'runtime' | null
): TranslationKey | undefined {
  return code && code !== 'runtime' ? PROVIDER_ERROR_COPY[code] : undefined;
}
