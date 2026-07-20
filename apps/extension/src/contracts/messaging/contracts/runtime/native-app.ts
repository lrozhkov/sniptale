// policyStateIds: [] - runtime native-app contract guards use static enum tables only.
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../runtime-message/index';
import {
  isBoolean,
  createMessageGuard,
  createRuntimeResponseGuard,
  isNumber,
  isRecord,
  isString,
} from '../../validators/index';
import {
  isNativeCaptureSettings,
  isNativeEffectiveSettings,
  isNativeSettingsWarnings,
} from '../../../native-app/parser-settings';

type PartialRuntimeRegistry = Partial<
  MessageContractRegistry<RuntimeRequestByType, RuntimeResponseByType>
>;

const nativeAppOperations = new Set(['reconnect', 'take-controller', 'sync-settings']);
const connectionStates = new Set([
  'not-connected',
  'connecting',
  'connected',
  'policy-denied',
  'missing-host',
  'incompatible-protocol',
  'incompatible-settings',
  'app-upgrade-required',
  'extension-upgrade-required',
  'controlled-by-other-profile',
  'repair-required',
  'error',
]);
const leaseStatuses = new Set(['granted', 'owned-by-other-profile', 'rejected']);

function isNativeAppOperation(value: unknown): boolean {
  return isString(value) && nativeAppOperations.has(value);
}

function isNativePlatform(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['kind']) &&
    isString(value['version']) &&
    isString(value['arch'])
  );
}

function isNativeInstall(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNativePlatform(value['platform']) &&
    isString(value['appVersion']) &&
    isNumber(value['appCacheSchemaVersion']) &&
    isString(value['installerVersion']) &&
    isString(value['nativeHostManifestVersion']) &&
    isString(value['updateChannel']) &&
    isBoolean(value['signedBinary']) &&
    isBoolean(value['rollbackProtected']) &&
    isRecord(value['autostart']) &&
    isBoolean(value['autostart']['supported']) &&
    isBoolean(value['autostart']['enabled']) &&
    isString(value['autostart']['method']) &&
    isString(value['packageIntegrity'])
  );
}

function isNativeAppError(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['code']) &&
    (value['message'] === undefined || isString(value['message'])) &&
    isBoolean(value['recoverable'])
  );
}

function isNativeRecordingStatus(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['recordingId']) &&
    isString(value['status']) &&
    isNumber(value['durationMs'])
  );
}

function isNativeAppStatus(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoolean(value['connectedBrowser']) &&
    (value['recording'] === null || isNativeRecordingStatus(value['recording'])) &&
    (value['lastError'] === null || isNativeAppError(value['lastError'])) &&
    (value['settingsRevision'] === null || isString(value['settingsRevision'])) &&
    isNativeInstall(value['install'])
  );
}

function isNativeControllerLease(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value['protocolVersion']) &&
    isString(value['controllerLeaseId']) &&
    isRecord(value['controller']) &&
    isString(value['controller']['extensionId']) &&
    isString(value['controller']['browserFamily']) &&
    isString(value['controller']['profileKey']) &&
    isString(value['controller']['connectionId']) &&
    isNumber(value['expiresAtEpochMs']) &&
    isString(value['status']) &&
    leaseStatuses.has(value['status'])
  );
}

function isNativeCapabilities(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value['capture']) &&
    Array.isArray(value['capture']['screenshotModes']) &&
    Array.isArray(value['capture']['videoModes']) &&
    isBoolean(value['capture']['supportsFreezeRegionSelection']) &&
    isRecord(value['codecs']) &&
    Array.isArray(value['codecs']['containers']) &&
    Array.isArray(value['codecs']['video']) &&
    Array.isArray(value['codecs']['audio']) &&
    isBoolean(value['codecs']['hardwareEncoderAvailable']) &&
    Array.isArray(value['codecs']['unavailableReasons']) &&
    isRecord(value['audio']) &&
    Array.isArray(value['audio']['microphoneDevices']) &&
    isBoolean(value['audio']['supportsMicrophone']) &&
    isBoolean(value['audio']['supportsSystemAudio']) &&
    isBoolean(value['audio']['supportsMixedAudio']) &&
    Array.isArray(value['audio']['unavailableReasons']) &&
    isRecord(value['limits']) &&
    isNumber(value['limits']['maxChunkBytes']) &&
    isNumber(value['limits']['maxRecordingBytes']) &&
    isNumber(value['limits']['maxScreenshotBytes']) &&
    isNumber(value['limits']['maxFps']) &&
    isNumber(value['limits']['maxWidth']) &&
    isNumber(value['limits']['maxHeight'])
  );
}

function isNativeTrayActions(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['revision']) &&
    Array.isArray(value['actions']) &&
    (value['shortcutPriority'] === undefined ||
      isNativeTrayShortcutPriority(value['shortcutPriority'])) &&
    value['actions'].every(
      (action) =>
        isRecord(action) &&
        isBoolean(action['enabled']) &&
        isString(action['id']) &&
        isString(action['kind']) &&
        isString(action['label'])
    )
  );
}

function isNativeTrayShortcutPriority(value: unknown): boolean {
  return (
    isRecord(value) &&
    value['when'] === 'browser-active' &&
    value['winner'] === 'extension' &&
    Array.isArray(value['shortcutLabels']) &&
    value['shortcutLabels'].every((item) => isString(item) && item.length <= 40)
  );
}

function isNativeRuntimeStatus(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['appStatus'] === null || isNativeAppStatus(value['appStatus'])) &&
    (value['capabilities'] === null || isNativeCapabilities(value['capabilities'])) &&
    isString(value['connectionState']) &&
    connectionStates.has(value['connectionState']) &&
    (value['controllerLease'] === null || isNativeControllerLease(value['controllerLease'])) &&
    (value['effectiveSettings'] === null ||
      isNativeEffectiveSettings(value['effectiveSettings'])) &&
    (value['error'] === null || isNativeAppError(value['error'])) &&
    isString(value['hostName']) &&
    (value['install'] === null || isNativeInstall(value['install'])) &&
    (value['lastHeartbeatAt'] === null || isNumber(value['lastHeartbeatAt'])) &&
    (value['platform'] === null || isNativePlatform(value['platform'])) &&
    (value['settingsRevision'] === null || isString(value['settingsRevision'])) &&
    (value['trayActions'] === null || isNativeTrayActions(value['trayActions'])) &&
    isNativeSettingsWarnings(value['warnings'])
  );
}

export const runtimeNativeAppMessageContracts = {
  [MessageType.NATIVE_APP_QUERY]: {
    parseRequest: createGuardParser(
      'runtime NATIVE_APP_QUERY message',
      createMessageGuard({
        type: MessageType.NATIVE_APP_QUERY,
        required: { requestId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime NATIVE_APP_QUERY response',
      createRuntimeResponseGuard({
        optional: { settings: isNativeCaptureSettings, status: isNativeRuntimeStatus },
      })
    ),
  },
  [MessageType.NATIVE_APP_MUTATION]: {
    parseRequest: createGuardParser(
      'runtime NATIVE_APP_MUTATION message',
      createMessageGuard({
        type: MessageType.NATIVE_APP_MUTATION,
        required: { operation: isNativeAppOperation, requestId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime NATIVE_APP_MUTATION response',
      createRuntimeResponseGuard({
        optional: { settings: isNativeCaptureSettings, status: isNativeRuntimeStatus },
      })
    ),
  },
} satisfies PartialRuntimeRegistry;
