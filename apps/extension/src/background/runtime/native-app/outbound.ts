import type { NativeAppCapabilities } from '../../../contracts/native-app';
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

export const NATIVE_CURSOR_TRAJECTORY_ENABLED = true;
export const NATIVE_RECORDING_EVENTS_ENABLED = true;

/** Checks the independently offered format after the boundary parser admits its limits. */
export function supportsNativeRecordingHistory(
  capabilities: NativeAppCapabilities | null,
  kind: 'cursor' | 'events'
): boolean {
  return kind === 'cursor'
    ? capabilities?.attachments?.cursorTrajectoryFormats.includes('cursor-trajectory-v1') === true
    : capabilities?.eventAttachments?.recordingEventFormats.includes('recording-events-v1') ===
        true;
}

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
    capabilities: [
      'desktop-settings-v1',
      'durable-media-ack-v1',
      ...(NATIVE_CURSOR_TRAJECTORY_ENABLED ? ['cursor-trajectory-v1' as const] : []),
      ...(NATIVE_RECORDING_EVENTS_ENABLED ? ['recording-events-v1' as const] : []),
    ],
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
