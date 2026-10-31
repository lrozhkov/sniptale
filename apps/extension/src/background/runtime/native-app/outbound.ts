import {
  MIN_SUPPORTED_NATIVE_APP_VERSION,
  NATIVE_APP_PROTOCOL_VERSION,
  NATIVE_APP_SETTINGS_SCHEMA_VERSION,
  NATIVE_SUPPORTED_PROTOCOL_VERSIONS,
  NATIVE_SUPPORTED_SETTINGS_SCHEMA_VERSIONS,
  type ExtensionControllerAcquireMessage,
  type ExtensionHelloMessage,
  type ExtensionPingMessage,
  type NativeControllerIdentity,
} from '../../../contracts/native-app';
import { createNativeCommandId } from './ids';

type ControllerAcquireReason =
  | 'initial-connect'
  | 'user-requested-takeover'
  | 'stale-controller-recovery';

export function createNativeHelloMessage(args: {
  extensionId: string;
  extensionVersion: string;
  connectionIntent?: 'user-requested' | 'automatic';
}): ExtensionHelloMessage {
  return {
    connectionIntent: args.connectionIntent ?? 'automatic',
    capabilities: ['desktop-settings-v1', 'durable-media-ack-v1'],
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

export function createNativePingMessage(): ExtensionPingMessage {
  return {
    nonce: createNativeCommandId('ping'),
    protocolVersion: NATIVE_APP_PROTOCOL_VERSION,
    sentAtEpochMs: Date.now(),
    type: 'extension.ping',
  };
}
