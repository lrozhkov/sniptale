import {
  MIN_SUPPORTED_NATIVE_APP_VERSION,
  NATIVE_APP_PROTOCOL_VERSION,
  NATIVE_APP_SETTINGS_SCHEMA_VERSION,
  NATIVE_SUPPORTED_PROTOCOL_VERSIONS,
  NATIVE_SUPPORTED_SETTINGS_SCHEMA_VERSIONS,
  type ExtensionControllerAcquireMessage,
  type ExtensionHelloMessage,
  type ExtensionPingMessage,
  type ExtensionSettingsSyncMessage,
  type NativeControllerIdentity,
} from '../../../contracts/native-app';
import { createNativeCommandId } from './ids';
import type { loadNativeSettingsSnapshot } from './settings-snapshot';

type ControllerAcquireReason =
  | 'initial-connect'
  | 'user-requested-takeover'
  | 'stale-controller-recovery';

type NativeSettingsSnapshot = Awaited<ReturnType<typeof loadNativeSettingsSnapshot>>;

export function createNativeHelloMessage(args: {
  extensionId: string;
  extensionVersion: string;
}): ExtensionHelloMessage {
  return {
    extensionId: args.extensionId,
    extensionVersion: args.extensionVersion,
    minAppVersion: MIN_SUPPORTED_NATIVE_APP_VERSION,
    protocolVersion: NATIVE_APP_PROTOCOL_VERSION,
    settingsSchemaVersion: NATIVE_APP_SETTINGS_SCHEMA_VERSION,
    supportedProtocolVersions: [...NATIVE_SUPPORTED_PROTOCOL_VERSIONS],
    supportedSettingsSchemaVersions: [...NATIVE_SUPPORTED_SETTINGS_SCHEMA_VERSIONS],
    type: 'extension.hello',
  };
}

export function createNativeControllerAcquireMessage(args: {
  identity: NativeControllerIdentity;
  reason: ControllerAcquireReason;
}): ExtensionControllerAcquireMessage {
  return {
    browserFamily: args.identity.browserFamily,
    connectionId: args.identity.connectionId,
    extensionId: args.identity.extensionId,
    ...(args.identity.documentId === undefined ? {} : { documentId: args.identity.documentId }),
    profileKey: args.identity.profileKey,
    protocolVersion: NATIVE_APP_PROTOCOL_VERSION,
    reason: args.reason,
    requestedAtEpochMs: Date.now(),
    type: 'extension.controller.acquire',
  };
}

export function createNativeSettingsSyncMessage(args: {
  controllerLeaseId: string;
  snapshot: NativeSettingsSnapshot;
}): ExtensionSettingsSyncMessage {
  return {
    controllerLeaseId: args.controllerLeaseId,
    generatedAtEpochMs: Date.now(),
    protocolVersion: NATIVE_APP_PROTOCOL_VERSION,
    revision: args.snapshot.revision,
    schemaVersion: args.snapshot.schemaVersion,
    settings: {
      screenshots: args.snapshot.native.screenshots,
      trayActions: args.snapshot.trayActions,
      video: args.snapshot.native.video,
    },
    type: 'extension.settings.sync',
  };
}

export function createNativePingMessage(): ExtensionPingMessage {
  return {
    nonce: createNativeCommandId('ping'),
    protocolVersion: NATIVE_APP_PROTOCOL_VERSION,
    sentAtEpochMs: Date.now(),
    type: 'extension.ping',
  };
}
