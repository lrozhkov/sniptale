import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import type { NativeAppOutboundMessage } from '../../../contracts/native-app';
import { cleanupStaleNativeTransferSessions } from '../../capture/native-app/persistence/staging';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createNativeAppIngestionController } from '../../capture/native-app/controller';
import { createNativeConnectionId } from './ids';
import { applyNativeDisconnectError, applyNativeStartupError } from './errors';
import {
  resolveNativeRuntimeServiceDeps,
  type ResolvedNativeRuntimeServiceDeps,
} from './service-default-deps';
import { NativeHeartbeatController } from './service-heartbeat';
import { dispatchNativeRuntimeMessage } from './service-message-dispatch';
import { syncNativeSettings } from './service-settings-sync';
import { postNativeControllerAcquire } from './service-controller-acquire';
import { parseNativeRuntimeMessage } from './service-message-parser';
import { subscribeNativeQuickActionSettingsSync } from './service-quick-action-sync';
import { openNativeRuntimePort } from './service-port';
import type {
  NativeAppRuntimeService,
  NativeAppRuntimeServiceDeps,
  NativeControllerAcquireReason,
} from './service-types';
import { createNativeSettingsSyncTracker } from './settings-sync-state';
import { createInitialNativeAppRuntimeStatus } from './status';
import { clearNativeAuthorityStatus } from './status-updates';
import { NativeServiceAuthorityState } from './service-authority';

const logger = createLogger({ namespace: 'BackgroundNativeAppRuntime' });

class Controller implements NativeAppRuntimeService {
  private connectionId = createNativeConnectionId();
  private readonly authority = new NativeServiceAuthorityState();
  private port: chrome.runtime.Port | null = null;
  private readonly deps: ResolvedNativeRuntimeServiceDeps;
  private readonly heartbeat = new NativeHeartbeatController({
    getHandshakeAccepted: () => this.authority.getHandshakeAccepted(),
    post: (message) => this.post(message),
    reconnect: () => this.reconnectAfterStaleHeartbeat(),
  });
  private readonly ingestion;
  private readonly settingsSync = createNativeSettingsSyncTracker();
  private status;
  private unsubscribeQuickSync: (() => void) | null = null;
  private readonly warn = (message: string) => logger.warn(message);

  constructor(deps: ResolvedNativeRuntimeServiceDeps) {
    this.deps = deps;
    this.status = createInitialNativeAppRuntimeStatus(deps.hostName);
    this.ingestion = createNativeAppIngestionController({
      getCurrentControllerLeaseId: () => this.status.controllerLease?.controllerLeaseId ?? null,
    });
  }

  connect(reason: NativeControllerAcquireReason = 'initial-connect'): void {
    if (this.port) {
      return;
    }
    this.startQuickActionSyncListener();
    this.clearAuthority('connecting');
    this.connectionId = createNativeConnectionId();
    void cleanupStaleNativeTransferSessions();
    try {
      this.openPort(reason);
    } catch (error) {
      this.port = null;
      this.clearAuthority('missing-host');
      this.status = applyNativeStartupError(this.status, error);
    }
  }

  async getStatus() {
    return this.status;
  }

  reconnect(): void {
    this.port?.disconnect();
    this.port = null;
    this.connect('initial-connect');
  }

  quiesceForPrivacyErasure(): void {
    const activePort = this.port;
    this.port = null;
    try {
      activePort?.disconnect();
    } catch {
      logger.warn('Failed to disconnect native app during local data erasure');
    }
    this.clearAuthority('not-connected');
  }

  syncSettings = async (): Promise<void> => {
    await this.sync();
  };

  takeController(): void {
    if (!this.port) {
      this.connect('user-requested-takeover');
      return;
    }
    if (!this.authority.getHandshakeAccepted()) {
      this.authority.setPendingReason('user-requested-takeover');
      return;
    }
    this.acquire('user-requested-takeover');
  }

  private openPort(reason: NativeControllerAcquireReason): void {
    this.port = openNativeRuntimePort({
      connectNative: this.deps.connectNative,
      handleDisconnect: (port) => this.handleDisconnect(port),
      handleMessage: this.handleMessage,
      hostName: this.deps.hostName,
      reason,
      setPendingReason: (nextReason) => {
        this.authority.setPendingReason(nextReason);
      },
    });
    this.heartbeat.start();
  }

  private handleDisconnect(disconnectedPort: chrome.runtime.Port | null): void {
    if (disconnectedPort !== this.port) {
      return;
    }
    const lastError = runtimeInfo.getLastError();
    this.port = null;
    this.clearAuthority(lastError?.message?.includes('policy') ? 'policy-denied' : 'missing-host');
    this.status = applyNativeDisconnectError(this.status, lastError);
  }

  private clearAuthority(nextState: Parameters<typeof clearNativeAuthorityStatus>[1]): void {
    this.authority.clear();
    this.heartbeat.stop();
    this.settingsSync.invalidate();
    this.status = clearNativeAuthorityStatus(this.status, nextState);
  }

  private startQuickActionSyncListener(): void {
    if (this.unsubscribeQuickSync) {
      return;
    }
    this.unsubscribeQuickSync = subscribeNativeQuickActionSettingsSync({
      storage: this.deps.storage,
      sync: () => this.sync(),
    });
  }

  private post = (message: NativeAppOutboundMessage): void => {
    this.port?.postMessage(message);
  };

  private acquire(reason: NativeControllerAcquireReason): void {
    void postNativeControllerAcquire({
      connectionId: this.connectionId,
      extensionId: chrome.runtime.id,
      getConnectionId: () => this.connectionId,
      getPort: () => this.port,
      port: this.port,
      reason,
      storage: this.deps.storage,
      updateStatus: (updater) => {
        this.status = updater(this.status);
      },
    });
  }

  private reconnectAfterStaleHeartbeat(): void {
    this.port?.disconnect();
    this.port = null;
    this.connect('stale-controller-recovery');
  }

  private async sync(): Promise<void> {
    await syncNativeSettings({
      getCapabilities: () => this.status.capabilities,
      getLease: () => this.status.controllerLease,
      hasGrantedLease: this.ownsLease,
      post: this.post,
      settingsSync: this.settingsSync,
      updateStatus: (patch) => {
        this.status = { ...this.status, ...patch };
      },
    });
  }

  private ownsLease = (message: { controllerLeaseId: string }): boolean => {
    return this.authority.ownsLease(this.status, message);
  };

  private readonly handleMessage = (
    rawMessage: unknown,
    messagePort: chrome.runtime.Port
  ): void => {
    if (messagePort !== this.port) {
      return;
    }
    const parsed = parseNativeRuntimeMessage({
      rawMessage,
      status: this.status,
      warn: this.warn,
    });
    this.status = parsed.status;
    if (!parsed.message) {
      return;
    }
    dispatchNativeRuntimeMessage(
      {
        acceptLeaseGeneration: () => {
          this.authority.acceptLeaseGeneration();
        },
        acquire: (reason) => this.acquire(reason),
        clearPendingReason: () => {
          this.authority.setPendingReason(null);
        },
        getConnectionId: () => this.connectionId,
        getHandshakeAccepted: () => this.authority.getHandshakeAccepted(),
        getPendingReason: () => this.authority.getPendingReason(),
        getStatus: () => this.status,
        ingestion: this.ingestion,
        consumeInvocation: (message) => this.authority.consumeInvocation(message, this.warn),
        notePong: () => {
          this.heartbeat.notePong();
        },
        ownsLease: this.ownsLease,
        post: this.post,
        setHandshakeAccepted: (accepted) => {
          this.authority.setHandshakeAccepted(accepted);
        },
        setStatus: (status) => {
          this.status = status;
        },
        settingsSync: this.settingsSync,
        sync: () => this.sync(),
        warn: this.warn,
      },
      parsed.message
    );
  };
}

export function createNativeAppRuntimeService(
  deps: Partial<NativeAppRuntimeServiceDeps> = {}
): NativeAppRuntimeService {
  return new Controller(resolveNativeRuntimeServiceDeps(deps));
}
