import { createNativeHistoryRetry } from './service-history-retry';
import {
  NATIVE_CURSOR_TRAJECTORY_ENABLED,
  NATIVE_RECORDING_EVENTS_ENABLED,
  supportsNativeRecordingHistory,
} from './outbound';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import type {
  AppHelloMessage,
  NativeAppInboundMessage,
  NativeAppOutboundMessage,
} from '../../../contracts/native-app';
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
import {
  isNativeAppTrusted,
  trustNativeAppClient,
  forgetNativeAppClient,
  isNativeAppAutoConnectPaused,
  setNativeAppAutoConnectPaused,
} from '../../../composition/persistence/native-app-trust';
import { applyNativeHelloAuthority } from './service-hello';
import { postNativeControllerAcquire } from './service-controller-acquire';
import { parseNativeRuntimeMessage } from './service-message-parser';
import { openNativeRuntimePort } from './service-port';
import type {
  NativeAppRuntimeService,
  NativeAppRuntimeServiceDeps,
  NativeControllerAcquireReason,
} from './service-types';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import { createInitialNativeAppRuntimeStatus } from './status';
import { clearNativeAuthorityStatus } from './status-updates';
import { NativeServiceAuthorityState } from './service-authority';

const logger = createLogger({ namespace: 'BackgroundNativeAppRuntime' });

class Controller implements NativeAppRuntimeService {
  private intentGeneration = 0;
  private connectionId = createNativeConnectionId();
  private readonly authority = new NativeServiceAuthorityState();
  private port: chrome.runtime.Port | null = null;
  private leaseTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingHello: AppHelloMessage | null = null;
  private pendingQuitHello: AppHelloMessage | null = null;
  private readonly deps: ResolvedNativeRuntimeServiceDeps;
  private readonly heartbeat = new NativeHeartbeatController({
    getHandshakeAccepted: () => this.pendingHello !== null,
    post: (message) => this.post(message),
    reconnect: () => this.reconnectAfterStaleHeartbeat(),
    handshakeTimedOut: () => {
      this.disconnect('error');
      this.status = applyNativeStartupError(
        this.status,
        new Error('Native app handshake timed out')
      );
    },
  });
  private readonly historyRetry = createNativeHistoryRetry({
    target: () => {
      const lease = this.status.controllerLease;
      if (
        !this.port ||
        !lease ||
        !this.ownsLease(lease) ||
        (!this.historyEnabled('cursor') && !this.historyEnabled('events'))
      )
        return null;
      return { connectionId: this.connectionId, controllerLeaseId: lease.controllerLeaseId };
    },
    resume: (lease) => this.ingestion.resumePendingHistoryTransfers(lease),
    post: (message) => this.post(message),
    warn: () => this.warn('Native history retry remains pending'),
  });
  private historyEnabled(kind: 'cursor' | 'events') {
    return (
      (kind === 'cursor' ? NATIVE_CURSOR_TRAJECTORY_ENABLED : NATIVE_RECORDING_EVENTS_ENABLED) &&
      supportsNativeRecordingHistory(this.status.capabilities, kind)
    );
  }
  private readonly ingestion;
  private status: NativeAppRuntimeStatus;
  private readonly warn = (message: string) => logger.warn(message);

  constructor(deps: ResolvedNativeRuntimeServiceDeps) {
    this.deps = deps;
    this.status = createInitialNativeAppRuntimeStatus(deps.hostName);
    this.ingestion = createNativeAppIngestionController({
      isHistoryEnabled: (kind) => this.historyEnabled(kind),
      getCurrentControllerLeaseId: () => {
        const lease = this.status.controllerLease;
        return lease && this.ownsLease(lease) ? lease.controllerLeaseId : null;
      },
    });
  }

  async canAutoConnect(): Promise<boolean> {
    return !(await isNativeAppAutoConnectPaused(this.deps.storage.session));
  }

  connect(
    reason: NativeControllerAcquireReason = 'initial-connect',
    connectionIntent: 'user-requested' | 'automatic' = 'automatic'
  ): void {
    if (this.port) {
      return;
    }
    this.clearAuthority('connecting');
    this.connectionId = createNativeConnectionId();
    void cleanupStaleNativeTransferSessions();
    try {
      this.openPort(reason, connectionIntent);
    } catch (error) {
      this.port = null;
      this.clearAuthority('missing-host');
      this.status = applyNativeStartupError(this.status, error);
      this.scheduleReconnect();
    }
  }

  async getStatus() {
    return this.status;
  }

  disconnectForPermissionRevocation(): void {
    this.disconnect('not-connected');
  }

  async reconnect(): Promise<void> {
    this.disconnect('not-connected');
    const generation = this.intentGeneration;
    if (
      !(await setNativeAppAutoConnectPaused(
        this.deps.storage.session,
        false,
        () => generation === this.intentGeneration
      ))
    )
      return;
    this.heartbeat.resetRetries();
    this.connect('initial-connect', 'user-requested');
  }

  quiesceForPrivacyErasure(): void {
    this.disconnect('not-connected');
  }

  async trustClient(clientId: string): Promise<void> {
    const hello = this.pendingHello;
    const port = this.port;
    if (
      !hello ||
      hello.appIdentity.clientId !== clientId ||
      this.status.connectionState !== 'trust-required'
    ) {
      throw new Error('Desktop identity changed. Check the connection again.');
    }
    const isCurrent = () => this.port === port && this.pendingHello === hello;
    const saved = await trustNativeAppClient({
      storage: this.deps.storage.local,
      hostName: this.deps.hostName,
      clientId,
      isCurrent,
    });
    if (saved && isCurrent()) this.dispatch(hello);
  }

  async forgetClient(): Promise<void> {
    this.disconnect('not-connected');
    await forgetNativeAppClient(this.deps.storage.local);
  }

  private openPort(
    reason: NativeControllerAcquireReason,
    connectionIntent: 'user-requested' | 'automatic'
  ): void {
    this.port = openNativeRuntimePort({
      connectNative: this.deps.connectNative,
      connectionIntent,
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

  private disconnect(nextState: Parameters<typeof clearNativeAuthorityStatus>[1]): void {
    this.intentGeneration += 1;
    const activePort = this.port;
    this.port = null;
    try {
      activePort?.disconnect();
    } catch {
      logger.warn('Failed to disconnect native app');
    }
    this.clearAuthority(nextState);
  }

  private handleDisconnect(disconnectedPort: chrome.runtime.Port | null): void {
    if (disconnectedPort !== this.port) {
      return;
    }
    const lastError = runtimeInfo.getLastError();
    const pendingQuit = this.pendingQuitHello;
    this.port = null;
    this.clearAuthority(lastError?.message?.includes('policy') ? 'policy-denied' : 'missing-host');
    this.status = applyNativeDisconnectError(this.status, lastError);
    if (pendingQuit) {
      // Resolve the installation pin before accepting Quit or retrying this closed bridge.
      this.pendingHello = pendingQuit;
      this.pendingQuitHello = pendingQuit;
      return;
    }
    if (this.status.connectionState !== 'policy-denied') this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.heartbeat.scheduleReconnect()) {
      this.status = { ...this.status, connectionState: 'reconnecting' };
    } else {
      this.status = applyNativeStartupError(
        { ...this.status, connectionState: 'error' },
        new Error('Native app reconnect attempts exhausted')
      );
    }
  }

  private handleUserQuit(): void {
    if (!this.authority.getHandshakeAccepted()) return;
    this.disconnect('not-connected');
    const generation = this.intentGeneration;
    void setNativeAppAutoConnectPaused(
      this.deps.storage.session,
      true,
      () => generation === this.intentGeneration
    ).catch((error: unknown) => {
      if (generation === this.intentGeneration)
        this.status = applyNativeStartupError({ ...this.status, connectionState: 'error' }, error);
    });
  }

  private clearAuthority(nextState: Parameters<typeof clearNativeAuthorityStatus>[1]): void {
    this.pendingHello = null;
    this.pendingQuitHello = null;
    this.authority.clear();
    if (this.leaseTimer !== null) clearTimeout(this.leaseTimer);
    this.leaseTimer = null;
    this.heartbeat.stop();
    this.historyRetry.stop();
    this.status = clearNativeAuthorityStatus(this.status, nextState);
  }

  private post = (message: NativeAppOutboundMessage): void => {
    const activePort = this.port;
    try {
      activePort?.postMessage(message);
    } catch (error) {
      if (activePort && activePort === this.port) {
        this.handleDisconnect(activePort);
        this.status = applyNativeStartupError(this.status, error);
      }
    }
  };

  private acquire(reason: NativeControllerAcquireReason): void {
    if (this.leaseTimer !== null) clearTimeout(this.leaseTimer);
    this.leaseTimer = setTimeout(() => {
      this.disconnect('error');
      this.status = applyNativeStartupError(
        this.status,
        new Error('Native app handshake timed out')
      );
    }, 15_000);
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
    this.disconnect('not-connected');
    this.connect('stale-controller-recovery');
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
      const failure = this.status;
      this.disconnect(failure.connectionState);
      this.status = failure;
      return;
    }
    if (parsed.message.type === 'app.connection.closed') {
      if (this.authority.getHandshakeAccepted()) this.handleUserQuit();
      else this.pendingQuitHello = this.pendingHello;
      return;
    }
    if (parsed.message.type === 'app.hello') {
      void this.receiveHello(parsed.message, messagePort);
      return;
    }
    if (
      parsed.message.type === 'app.pong' &&
      this.pendingHello &&
      !this.authority.getHandshakeAccepted()
    ) {
      this.heartbeat.notePong();
      return;
    }
    this.dispatch(parsed.message);
  };

  private async receiveHello(hello: AppHelloMessage, port: chrome.runtime.Port): Promise<void> {
    const pendingReason = this.authority.getPendingReason();
    this.authority.clear();
    this.authority.setPendingReason(pendingReason);
    this.pendingHello = null;
    this.pendingQuitHello = null;
    const next = applyNativeHelloAuthority({
      message: hello,
      pendingReason: null,
      status: this.status,
    });
    this.status = next.status;
    if (!next.handshakeAccepted) {
      this.disconnect(next.status.connectionState);
      this.status = next.status;
      return;
    }
    this.pendingHello = hello;
    this.status = { ...this.status, connectionState: 'trust-required', controllerLease: null };
    try {
      const trusted = await isNativeAppTrusted(
        this.deps.storage.local,
        this.deps.hostName,
        hello.appIdentity.clientId
      );
      if (this.pendingHello !== hello) return;
      const closedWithQuit = this.port === null && this.pendingQuitHello === hello;
      if (this.port !== port && !closedWithQuit) return;
      if (trusted && this.pendingQuitHello === hello) {
        this.authority.setHandshakeAccepted(true);
        this.handleUserQuit();
      } else if (closedWithQuit) {
        this.clearAuthority('missing-host');
        this.scheduleReconnect();
      } else if (trusted) this.dispatch(hello);
    } catch (error) {
      if (this.pendingHello === hello) {
        this.disconnect('error');
        this.status = applyNativeStartupError(this.status, error);
      }
    }
  }

  private dispatch(message: NativeAppInboundMessage): void {
    const messagePort = this.port;
    dispatchNativeRuntimeMessage(
      {
        acceptLeaseGeneration: () => {
          if (this.leaseTimer !== null) clearTimeout(this.leaseTimer);
          this.leaseTimer = null;
          this.heartbeat.resetRetries();
          this.authority.acceptLeaseGeneration();
          this.historyRetry.start();
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
        post: (response) => {
          if (messagePort !== this.port) return;
          if ('controllerLeaseId' in response && !this.ownsLease(response)) return;
          this.post(response);
        },
        setHandshakeAccepted: (accepted) => {
          this.authority.setHandshakeAccepted(accepted);
        },
        setStatus: (status) => {
          this.status = status;
        },
        warn: this.warn,
      },
      message
    );
  }
}

export function createNativeAppRuntimeService(
  deps: Partial<NativeAppRuntimeServiceDeps> = {}
): NativeAppRuntimeService {
  return new Controller(resolveNativeRuntimeServiceDeps(deps));
}
