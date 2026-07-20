import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import {
  MIN_SUPPORTED_NATIVE_APP_VERSION,
  NATIVE_APP_CACHE_SCHEMA_VERSION,
  NATIVE_APP_PROTOCOL_VERSION,
  NATIVE_APP_SETTINGS_SCHEMA_VERSION,
  NATIVE_HOST_MANIFEST_VERSION,
} from '../../../contracts/native-app';
import type { AppHelloMessage } from '../../../contracts/native-app';
import type { NativeAppConnectionState } from '../../../contracts/native-app/runtime';
import { resolveNativeAppChannel } from './host';

function compareSemver(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

export function resolveNativeHandshakeFailure(
  message: AppHelloMessage
): NativeAppConnectionState | null {
  if (!message.supportedProtocolVersions.includes(NATIVE_APP_PROTOCOL_VERSION)) {
    return 'incompatible-protocol';
  }
  if (!message.supportedSettingsSchemaVersions.includes(NATIVE_APP_SETTINGS_SCHEMA_VERSION)) {
    return 'incompatible-settings';
  }
  if (compareSemver(message.install.appVersion, MIN_SUPPORTED_NATIVE_APP_VERSION) < 0) {
    return 'app-upgrade-required';
  }
  if (
    compareSemver(runtimeInfo.getManifest().version ?? '0.0.0', message.minExtensionVersion) < 0
  ) {
    return 'extension-upgrade-required';
  }
  if (
    message.install.appCacheSchemaVersion < NATIVE_APP_CACHE_SCHEMA_VERSION ||
    message.install.nativeHostManifestVersion !== NATIVE_HOST_MANIFEST_VERSION ||
    message.install.updateChannel !== resolveNativeAppChannel() ||
    !message.install.signedBinary ||
    !message.install.rollbackProtected ||
    message.install.packageIntegrity === 'invalid'
  ) {
    return 'repair-required';
  }
  return null;
}
