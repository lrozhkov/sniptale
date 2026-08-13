import { translate } from '../../platform/i18n';

const errorMessageKeys = {
  disabled: 'viewportPresets.availability.disabled',
  missing: 'viewportPresets.availability.missing',
  'unsupported-context': 'viewportPresets.availability.unsupported',
  'window-too-large': 'viewportPresets.availability.windowTooLarge',
  'window-not-normal': 'viewportPresets.availability.windowNotNormal',
  'surface-busy': 'viewportPresets.availability.busy',
  'permission-denied': 'viewportPresets.availability.permissionDenied',
  'authorization-expired': 'viewportPresets.availability.authorizationExpired',
  'platform-rejected': 'viewportPresets.availability.platformRejected',
  'verification-failed': 'viewportPresets.availability.verificationFailed',
  'source-dimensions-mismatch': 'viewportPresets.availability.sourceDimensionsMismatch',
  'stale-generation': 'viewportPresets.availability.staleRequest',
  'restore-conflict': 'viewportPresets.availability.restoreConflict',
  'restore-impossible': 'viewportPresets.availability.restoreImpossible',
} as const;

export function getViewportPresetErrorMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const code = Object.keys(errorMessageKeys).find(
    (candidate) => message === candidate || message.includes(candidate)
  ) as keyof typeof errorMessageKeys | undefined;
  return code ? translate(errorMessageKeys[code]) : null;
}
