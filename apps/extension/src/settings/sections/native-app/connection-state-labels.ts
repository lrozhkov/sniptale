import type { TranslationKey } from '../../../platform/i18n/types';
import type { NativeAppConnectionState } from '../../../contracts/native-app/runtime';

const connectionStateLabels = {
  'app-upgrade-required': 'settings.nativeApp.connectionStateAppUpgradeRequired',
  connected: 'settings.nativeApp.connectionStateConnected',
  'controlled-by-other-profile': 'settings.nativeApp.connectionStateControlledByOtherProfile',
  connecting: 'settings.nativeApp.connectionStateConnecting',
  error: 'settings.nativeApp.connectionStateError',
  'extension-upgrade-required': 'settings.nativeApp.connectionStateExtensionUpgradeRequired',
  'incompatible-protocol': 'settings.nativeApp.connectionStateIncompatibleProtocol',
  'incompatible-settings': 'settings.nativeApp.connectionStateIncompatibleSettings',
  'missing-host': 'settings.nativeApp.connectionStateMissingHost',
  'not-connected': 'settings.nativeApp.connectionStateNotConnected',
  'policy-denied': 'settings.nativeApp.connectionStatePolicyDenied',
  'repair-required': 'settings.nativeApp.connectionStateRepairRequired',
} satisfies Record<NativeAppConnectionState, TranslationKey>;

export function getNativeConnectionStateLabel(
  connectionState: NativeAppConnectionState | null | undefined
): TranslationKey {
  return connectionStateLabels[connectionState ?? 'not-connected'];
}
