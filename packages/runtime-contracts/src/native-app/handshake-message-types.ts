import type { NativeAppCapabilities, NativeInstallState, NativePlatform } from './platform-types';
import type { NativeAppStatus } from './status-types';
import type {
  NativeEffectiveSettings,
  NativeSettingsWarning,
  NativeTrayActionRegistry,
} from './settings-types';

export interface ExtensionHelloMessage {
  type: 'extension.hello';
  protocolVersion: number;
  settingsSchemaVersion: number;
  extensionVersion: string;
  extensionId: string;
  minAppVersion: string;
  supportedProtocolVersions: number[];
  supportedSettingsSchemaVersions: number[];
}

export interface AppHelloMessage {
  type: 'app.hello';
  protocolVersion: number;
  settingsSchemaVersion: number;
  minExtensionVersion: string;
  supportedProtocolVersions: number[];
  supportedSettingsSchemaVersions: number[];
  appInstanceId: string;
  platform: NativePlatform;
  install: NativeInstallState;
  capabilities: NativeAppCapabilities;
}

export interface NativeControllerIdentity {
  extensionId: string;
  browserFamily: 'chrome' | 'edge' | 'chromium' | 'unknown';
  profileKey: string;
  documentId?: string;
  connectionId: string;
}

export interface ExtensionControllerAcquireMessage {
  type: 'extension.controller.acquire';
  protocolVersion: number;
  connectionId: string;
  extensionId: string;
  browserFamily: NativeControllerIdentity['browserFamily'];
  profileKey: string;
  documentId?: string;
  requestedAtEpochMs: number;
  reason: 'initial-connect' | 'user-requested-takeover' | 'stale-controller-recovery';
}

export interface AppControllerLeaseMessage {
  type: 'app.controller.lease';
  protocolVersion: number;
  controllerLeaseId: string;
  controller: NativeControllerIdentity;
  expiresAtEpochMs: number;
  status: 'granted' | 'owned-by-other-profile' | 'rejected';
}

export interface ExtensionSettingsSyncMessage {
  type: 'extension.settings.sync';
  protocolVersion: number;
  controllerLeaseId: string;
  revision: string;
  schemaVersion: number;
  generatedAtEpochMs: number;
  settings: {
    screenshots: import('../video/types/types').NativeScreenshotSettings;
    video: import('../video/types/types').NativeVideoSettings;
    trayActions: NativeTrayActionRegistry;
  };
}

export interface AppSettingsAcceptedMessage {
  type: 'app.settings.accepted';
  protocolVersion: number;
  controllerLeaseId: string;
  revision: string;
  schemaVersion: number;
  acceptedAtEpochMs: number;
  effectiveSettings: NativeEffectiveSettings;
  warnings: NativeSettingsWarning[];
}

export interface ExtensionPingMessage {
  type: 'extension.ping';
  protocolVersion: number;
  nonce: string;
  sentAtEpochMs: number;
}

export interface AppPongMessage {
  type: 'app.pong';
  protocolVersion: number;
  nonce: string;
  sentAtEpochMs: number;
  appStatus: NativeAppStatus;
}
