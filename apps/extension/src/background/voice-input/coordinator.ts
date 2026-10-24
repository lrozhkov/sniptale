import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseVoiceInputPortRequest,
  parseVoiceInputServerEvent,
  parseVoiceInputCaptureEvent,
  VOICE_INPUT_HISTORY_PORT_NAME,
  type VoiceInputPreferences,
  VOICE_INPUT_PORT_NAME,
  VoiceInputPortMessageType,
  type OffscreenVoiceInputEventMessage,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLogger } from '@sniptale/platform/observability/logger';
import { authorizeVoiceInputPortSender } from './consumer-policy';
import {
  createVoiceInputOffscreenGateway,
  type VoiceInputOffscreenGateway,
} from './offscreen-gateway';
import {
  createIdleVoiceInputSnapshot,
  createVoiceInputFailureEvent,
  createVoiceInputSnapshotEvent,
  isActiveVoiceInputSnapshot,
  isTerminalVoiceInputSnapshot,
  postVoiceInputPortEvent,
  translateVoiceInputEvent,
  translateVoiceInputSnapshot,
  type ActiveVoiceInputSession,
  type VoiceInputPortRegistration,
} from './protocol';
import { VoiceInputSessionAuthority } from './session-authority';
import { VoiceInputStartOperation } from './start-operation';
import { loadSettings } from '../../composition/persistence/settings';
import {
  createVoiceInputHistory,
  type VoiceInputHistory,
} from '../../composition/persistence/voice-input-history';
import { createVoiceInputProcessor } from './processing';
import { createVoiceInputCaptureCompletion } from './capture-completion';
import { createVoiceInputHistoryPort } from './history-port';
import {
  createVoiceInputProcessingOperations,
  type VoiceInputProcessingOperations,
} from './processing-operation';

interface CoordinatorDependencies {
  history: VoiceInputHistory;
  loadPreferences(): Promise<VoiceInputPreferences>;
  processor: ReturnType<typeof createVoiceInputProcessor>;
}

const logger = createLogger({ namespace: 'BackgroundSpeechRecognition' });
const STOP_CLEANUP_RETRY_MS = 1_000;
const STOP_SETTLEMENT_TIMEOUT_MS = 1_000;

function withStopSettlementTimeout<TValue>(work: Promise<TValue>): Promise<TValue> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(
      () => reject(new Error('voice-input-stop-settlement-timeout')),
      STOP_SETTLEMENT_TIMEOUT_MS
    );
    void work.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

class VoiceInputCoordinator {
  private readonly sessions = new VoiceInputSessionAuthority();
  private readonly startOperation: VoiceInputStartOperation;
  private readonly processing: VoiceInputProcessingOperations;
  private readonly historyPort: ReturnType<typeof createVoiceInputHistoryPort>;
  private readonly captureCompletion: ReturnType<typeof createVoiceInputCaptureCompletion>;
  private readonly captureEvents = new Set<Promise<void>>();

  constructor(
    private readonly gateway: VoiceInputOffscreenGateway,
    private readonly createInternalSessionId: () => string,
    private readonly schedule: (callback: () => void, delayMs: number) => void,
    deps: CoordinatorDependencies
  ) {
    this.startOperation = new VoiceInputStartOperation(
      gateway,
      this.sessions,
      createInternalSessionId,
      deps.history,
      deps.loadPreferences
    );
    this.processing = createVoiceInputProcessingOperations({
      history: deps.history,
      processor: deps.processor,
    });
    this.captureCompletion = createVoiceInputCaptureCompletion({
      sessions: this.sessions,
      history: deps.history,
      processing: this.processing,
    });
    this.historyPort = createVoiceInputHistoryPort({
      history: deps.history,
      processing: this.processing,
      loadPreferences: deps.loadPreferences,
    });
  }

  registerPort(port: chrome.runtime.Port): void {
    if (port.name === VOICE_INPUT_HISTORY_PORT_NAME) {
      this.historyPort.registerPort(port);
      return;
    }
    if (port.name !== VOICE_INPUT_PORT_NAME) return;
    const sender = authorizeVoiceInputPortSender(port.sender);
    if (!sender) {
      logger.warn('Rejected unauthorized voice input port');
      port.disconnect();
      return;
    }
    const registration: VoiceInputPortRegistration = { ...sender, port };
    const onMessage = (message: unknown) => this.handleRequest(registration, message);
    const onDisconnect = () => this.disconnectPort(registration, onMessage, onDisconnect);
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    logger.debug('Voice input port connected', {
      consumerId: registration.consumerId,
      documentId: registration.documentId,
    });
  }

  handleOffscreenEvent(message: OffscreenVoiceInputEventMessage): void {
    const capture = parseVoiceInputCaptureEvent(message.event);
    if (capture) {
      const flight = this.captureCompletion.handle(capture);
      this.captureEvents.add(flight);
      void flight.finally(() => this.captureEvents.delete(flight)).catch(() => undefined);
      return;
    }
    const event = parseVoiceInputServerEvent(message.event);
    if (!event) return;
    const sessionId = 'sessionId' in event ? event.sessionId : event.snapshot.sessionId;
    const session = this.sessions.active;
    if (!session || sessionId !== session.offscreenSessionId) {
      logger.warn('Ignored stale or orphaned voice input event', {
        eventType: event.type,
        sessionId: sessionId ?? null,
      });
      return;
    }
    if (session.cancelled || session.processing) return;
    session.offscreenObserved = true;
    const translatedEvent = translateVoiceInputEvent(event, session);
    if ('snapshot' in translatedEvent) {
      this.sessions.replaceSnapshot(translatedEvent.snapshot);
    }
    if (translatedEvent.type !== VoiceInputPortMessageType.AUDIO_LEVEL) {
      logger.debug('Relaying voice input event', {
        ...(translatedEvent.type === VoiceInputPortMessageType.TRANSCRIPT
          ? {
              charCount: translatedEvent.text.length,
              confidence: translatedEvent.confidence,
              isFinal: translatedEvent.isFinal,
              sequence: translatedEvent.sequence,
            }
          : {}),
        ...('snapshot' in translatedEvent
          ? {
              apiFlavor: translatedEvent.snapshot.apiFlavor,
              effectiveMode: translatedEvent.snapshot.effectiveMode,
              errorCode: translatedEvent.snapshot.errorCode,
              fallbackReason: translatedEvent.snapshot.fallbackReason,
              localAvailability: translatedEvent.snapshot.localAvailability,
              phase: translatedEvent.snapshot.phase,
            }
          : {}),
        eventType: translatedEvent.type,
        sessionId: session.sessionId,
      });
    }
    postVoiceInputPortEvent(session, translatedEvent);
    if (
      'snapshot' in translatedEvent &&
      (translatedEvent.snapshot.phase === 'ended' || translatedEvent.snapshot.phase === 'error')
    ) {
      this.sessions.clearIf(session);
    }
  }

  async cleanupForPrivacyErasure(): Promise<boolean> {
    const sessionAtDispatch = this.sessions.active;
    if (sessionAtDispatch) sessionAtDispatch.cancelled = true;
    await this.processing.abortAndDrain();
    await Promise.allSettled([...this.captureEvents]);
    const requestId = `privacy-erasure:${this.createInternalSessionId()}`;
    try {
      if (
        !sessionAtDispatch &&
        !(await withStopSettlementTimeout(this.gateway.hasExistingDocument()))
      ) {
        this.sessions.reset();
        return true;
      }
      await withStopSettlementTimeout(this.gateway.ensureReady());
      const status = await withStopSettlementTimeout(
        this.gateway.send({
          requestId,
          type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
        })
      );
      if (status?.success !== true || !status.snapshot) return false;
      const offscreenSessionId = status.snapshot.sessionId;
      if (offscreenSessionId && isActiveVoiceInputSnapshot(status.snapshot)) {
        const stopped = await withStopSettlementTimeout(
          this.gateway.send({
            force: true,
            requestId,
            sessionId: offscreenSessionId,
            type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
          })
        );
        if (
          stopped?.success !== true ||
          stopped.result !== 'accepted' ||
          !stopped.snapshot ||
          stopped.snapshot.sessionId !== null ||
          stopped.snapshot.phase !== 'idle'
        ) {
          return false;
        }
      }
      if (this.sessions.active === sessionAtDispatch) {
        const idleSnapshot = this.sessions.reset(sessionAtDispatch?.preferences);
        if (sessionAtDispatch) {
          postVoiceInputPortEvent(
            sessionAtDispatch,
            createVoiceInputSnapshotEvent(idleSnapshot, requestId)
          );
        }
      }
      return true;
    } catch {
      logger.warn('Authoritative voice input privacy cleanup failed', { requestId });
      return false;
    }
  }

  private async cancelSession(session: ActiveVoiceInputSession, requestId: string): Promise<void> {
    session.cancelled = true;
    await this.processing.cancelOwner(session);
    if (session.captureReleased && session.processing) {
      if (this.sessions.owns(session)) this.completeStopCleanup(session, requestId);
      return;
    }
    session.stopCleanupPending = true;
    await this.recoverStopCleanup(session, requestId);
  }

  private disconnectPort(
    registration: VoiceInputPortRegistration,
    onMessage: (message: unknown) => void,
    onDisconnect: () => void
  ): void {
    registration.port.onMessage.removeListener(onMessage);
    registration.port.onDisconnect.removeListener(onDisconnect);
    if (this.sessions.active?.port === registration.port) {
      const session = this.sessions.active;
      void this.cancelSession(session, `disconnect:${session.sessionId}`);
    }
    logger.debug('Voice input port disconnected', {
      consumerId: registration.consumerId,
      documentId: registration.documentId,
    });
  }

  private handleRequest(registration: VoiceInputPortRegistration, rawRequest: unknown): void {
    const request = parseVoiceInputPortRequest(rawRequest);
    if (!request) {
      logger.warn('Rejected malformed voice input port request', {
        consumerId: registration.consumerId,
        documentId: registration.documentId,
      });
      return;
    }
    if (request.type === VoiceInputPortMessageType.STATUS) {
      void this.refreshStatus(registration, request.requestId);
    } else if (request.type === VoiceInputPortMessageType.START) {
      void this.startOperation.execute(registration, request);
    } else if (
      this.sessions.active?.port === registration.port &&
      this.sessions.active.sessionId === request.sessionId
    ) {
      if (request.type === VoiceInputPortMessageType.CANCEL)
        void this.cancelSession(this.sessions.active, request.requestId);
      else void this.stopSession(this.sessions.active, request.requestId);
    }
  }

  private async refreshStatus(
    registration: VoiceInputPortRegistration,
    requestId: string
  ): Promise<void> {
    const sessionAtDispatch = this.sessions.active;
    if (this.deliverSupersedingSnapshot(registration, requestId, sessionAtDispatch)) return;
    const offscreenObservedAtDispatch = sessionAtDispatch?.offscreenObserved === true;
    logger.debug('Reconciling voice input status', {
      consumerId: registration.consumerId,
      documentId: registration.documentId,
      requestId,
    });
    try {
      await this.gateway.ensureReady();
      const response = await this.gateway.send({
        requestId,
        type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
      });
      const snapshot = response?.success === true ? response.snapshot : undefined;
      if (!snapshot) throw new Error('offscreen-status-unavailable');
      const deliveredToActiveOwner = this.reconcileStatusSnapshot({
        offscreenObservedAtDispatch,
        registration,
        requestId,
        sessionAtDispatch,
        snapshot,
      });
      if (this.isOrphanedSnapshot(snapshot)) {
        logger.warn('Reconciling orphaned offscreen voice input session', {
          sessionId: snapshot.sessionId,
        });
        const stopped = await this.gateway.send({
          force: true,
          requestId,
          sessionId: snapshot.sessionId,
          type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
        });
        if (this.deliverSupersedingSnapshot(registration, requestId, sessionAtDispatch)) return;
        if (
          stopped?.success !== true ||
          stopped.result !== 'accepted' ||
          !stopped.snapshot ||
          stopped.snapshot.phase !== 'idle' ||
          stopped.snapshot.sessionId !== null
        ) {
          throw new Error('offscreen-orphan-stop-unverified');
        }
        this.sessions.reset({
          language: snapshot.language,
          microphoneDeviceId: null,
          mode: snapshot.requestedMode,
        });
      }
      if (!deliveredToActiveOwner) {
        postVoiceInputPortEvent(
          registration,
          createVoiceInputSnapshotEvent(this.sessions.snapshot, requestId)
        );
      }
      logger.debug('Voice input status reconciled', {
        phase: this.sessions.snapshot.phase,
        requestId,
        sessionId: this.sessions.snapshot.sessionId,
      });
    } catch {
      if (this.deliverSupersedingSnapshot(registration, requestId, sessionAtDispatch)) return;
      logger.warn('Voice input status reconciliation failed', { requestId });
      postVoiceInputPortEvent(
        registration,
        createVoiceInputFailureEvent({ errorCode: 'offscreen-unavailable', requestId })
      );
    }
  }

  private deliverSupersedingSnapshot(
    registration: VoiceInputPortRegistration,
    requestId: string,
    session: ActiveVoiceInputSession | null
  ): boolean {
    const replaced = this.sessions.active !== session;
    const transferred =
      session && !session.cancelled && (session.captureReleased || session.processing);
    if (!replaced && !transferred) return false;
    postVoiceInputPortEvent(
      registration,
      createVoiceInputSnapshotEvent(this.sessions.snapshot, requestId)
    );
    return true;
  }

  private reconcileStatusSnapshot(args: {
    offscreenObservedAtDispatch: boolean;
    registration: VoiceInputPortRegistration;
    requestId: string;
    sessionAtDispatch: ActiveVoiceInputSession | null;
    snapshot: VoiceInputSnapshot;
  }): boolean {
    if (this.sessions.active !== args.sessionAtDispatch) {
      logger.warn('Ignored voice input status after session authority changed', {
        activeSessionId: this.sessions.active?.sessionId ?? null,
        dispatchSessionId: args.sessionAtDispatch?.sessionId ?? null,
        requestId: args.requestId,
        responseSessionId: args.snapshot.sessionId,
      });
      return false;
    }
    if (this.deliverSupersedingSnapshot(args.registration, args.requestId, args.sessionAtDispatch))
      return true;
    if (!args.sessionAtDispatch) {
      this.sessions.replaceSnapshot(
        createIdleVoiceInputSnapshot({
          language: args.snapshot.language,
          microphoneDeviceId: null,
          mode: args.snapshot.requestedMode,
        })
      );
      return false;
    }
    if (args.snapshot.sessionId === args.sessionAtDispatch.offscreenSessionId) {
      const translatedSnapshot = translateVoiceInputSnapshot(args.snapshot, args.sessionAtDispatch);
      args.sessionAtDispatch.offscreenObserved = true;
      this.sessions.replaceSnapshot(translatedSnapshot);
      if (!isTerminalVoiceInputSnapshot(translatedSnapshot)) {
        postVoiceInputPortEvent(
          args.sessionAtDispatch,
          createVoiceInputSnapshotEvent(translatedSnapshot, args.requestId)
        );
        return args.sessionAtDispatch.port === args.registration.port;
      }
      this.sessions.clearIf(args.sessionAtDispatch);
      postVoiceInputPortEvent(
        args.sessionAtDispatch,
        createVoiceInputSnapshotEvent(translatedSnapshot, args.requestId)
      );
      logger.warn('Recovered a missed terminal voice input event from status', {
        phase: translatedSnapshot.phase,
        requestId: args.requestId,
        sessionId: args.snapshot.sessionId,
      });
      return args.sessionAtDispatch.port === args.registration.port;
    }
    if (
      args.offscreenObservedAtDispatch &&
      args.snapshot.phase === 'idle' &&
      args.snapshot.sessionId === null
    ) {
      this.sessions.reset(args.sessionAtDispatch.preferences);
      postVoiceInputPortEvent(
        args.sessionAtDispatch,
        createVoiceInputFailureEvent({
          errorCode: 'offscreen-unavailable',
          preferences: args.sessionAtDispatch.preferences,
          requestId: args.requestId,
          sessionId: args.sessionAtDispatch.sessionId,
        })
      );
      logger.warn('Recovered an offscreen restart during voice input', {
        requestId: args.requestId,
        sessionId: args.sessionAtDispatch.sessionId,
      });
      return args.sessionAtDispatch.port === args.registration.port;
    }
    logger.warn('Ignored stale voice input status response', {
      activeSessionId: args.sessionAtDispatch.sessionId,
      requestId: args.requestId,
      responseSessionId: args.snapshot.sessionId,
    });
    return false;
  }

  private isOrphanedSnapshot(snapshot: VoiceInputSnapshot): snapshot is VoiceInputSnapshot & {
    sessionId: string;
  } {
    return Boolean(
      snapshot.sessionId && !this.sessions.active && isActiveVoiceInputSnapshot(snapshot)
    );
  }

  private async stopSession(
    session: ActiveVoiceInputSession,
    requestId: string,
    acquireMutationPermit = true
  ): Promise<boolean> {
    if (session.captureReleased || session.processing || session.cancelled) return true;
    logger.debug('Stopping voice input session', {
      acquireMutationPermit,
      requestId,
      sessionId: session.sessionId,
    });
    try {
      const sendStop = async () => {
        const response = await withStopSettlementTimeout(
          this.gateway.send({
            force: false,
            requestId,
            sessionId: session.offscreenSessionId,
            type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
          })
        );
        if (
          this.sessions.active !== session ||
          session.captureReleased ||
          session.processing ||
          session.cancelled
        )
          return;
        if (response?.success !== true) throw new Error('offscreen-stop-rejected');
        if (response.snapshot) {
          if (
            response.snapshot.sessionId !== null &&
            response.snapshot.sessionId !== session.offscreenSessionId
          ) {
            throw new Error('offscreen-stop-session-mismatch');
          }
          const translatedSnapshot = translateVoiceInputSnapshot(response.snapshot, session);
          this.sessions.replaceSnapshot(translatedSnapshot);
          postVoiceInputPortEvent(
            session,
            createVoiceInputSnapshotEvent(translatedSnapshot, requestId)
          );
          if (isTerminalVoiceInputSnapshot(translatedSnapshot)) {
            this.sessions.clearIf(session);
            return;
          }
          if (this.isStopCleanupVerified(session, response.snapshot)) {
            this.sessions.clearIf(session);
            return;
          }
        }
        if (response.result === 'stale') {
          throw new Error('offscreen-stop-stale');
        }
        if (session.captureReleased || session.processing) return;
        session.stopCleanupPending = true;
        this.scheduleStopCleanupRetry(session, requestId);
      };
      if (acquireMutationPermit) await this.gateway.withMediaMutationPermit(sendStop);
      else await sendStop();
      return true;
    } catch {
      if (
        this.sessions.active !== session ||
        session.captureReleased ||
        session.processing ||
        session.cancelled
      )
        return false;
      session.stopCleanupPending = true;
      await this.recoverStopCleanup(session, requestId);
      return false;
    }
  }

  private isStopCleanupVerified(
    session: ActiveVoiceInputSession,
    snapshot: VoiceInputSnapshot | undefined
  ): boolean {
    if (!snapshot || isActiveVoiceInputSnapshot(snapshot)) return false;
    return snapshot.sessionId === null || snapshot.sessionId === session.offscreenSessionId;
  }

  private canMutateCaptureCleanup(session: ActiveVoiceInputSession): boolean {
    return (
      this.sessions.active === session &&
      (session.cancelled === true || !(session.captureReleased || session.processing))
    );
  }

  private completeStopCleanup(session: ActiveVoiceInputSession, requestId: string): void {
    if (!this.canMutateCaptureCleanup(session)) return;
    session.stopCleanupPending = false;
    const idleSnapshot = this.sessions.reset(session.preferences);
    postVoiceInputPortEvent(session, createVoiceInputSnapshotEvent(idleSnapshot, requestId));
  }

  private scheduleStopCleanupRetry(session: ActiveVoiceInputSession, requestId: string): void {
    if (!session.stopCleanupPending || !this.canMutateCaptureCleanup(session)) return;
    this.schedule(() => {
      void this.recoverStopCleanup(session, requestId);
    }, STOP_CLEANUP_RETRY_MS);
  }

  private async recoverStopCleanup(
    session: ActiveVoiceInputSession,
    requestId: string
  ): Promise<void> {
    if (!session.stopCleanupPending || !this.canMutateCaptureCleanup(session)) return;
    try {
      const verified = await this.gateway.withMediaMutationPermit(async () => {
        await withStopSettlementTimeout(this.gateway.ensureReady());
        if (!session.stopCleanupPending || !this.canMutateCaptureCleanup(session)) return false;
        const forced = await withStopSettlementTimeout(
          this.gateway.send({
            force: true,
            requestId: `${requestId}:cleanup-stop`,
            sessionId: session.offscreenSessionId,
            type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
          })
        );
        if (!session.stopCleanupPending || !this.canMutateCaptureCleanup(session)) return false;
        if (forced?.success === true && this.isStopCleanupVerified(session, forced.snapshot)) {
          return true;
        }
        const status = await withStopSettlementTimeout(
          this.gateway.send({
            requestId: `${requestId}:cleanup-status`,
            type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
          })
        );
        return (
          session.stopCleanupPending &&
          this.canMutateCaptureCleanup(session) &&
          status?.success === true &&
          this.isStopCleanupVerified(session, status.snapshot)
        );
      });
      if (verified) {
        this.completeStopCleanup(session, requestId);
        return;
      }
    } catch {
      logger.warn('Voice input stop cleanup remains unverified', {
        requestId,
        sessionId: session.sessionId,
      });
    }
    this.scheduleStopCleanupRetry(session, requestId);
  }
}

function createInternalVoiceInputSessionId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) throw new Error('Voice input internal identity generation is unavailable.');
  return randomUUID.call(globalThis.crypto);
}

export function createVoiceInputCoordinator(
  gateway = createVoiceInputOffscreenGateway(),
  createInternalSessionId = createInternalVoiceInputSessionId,
  schedule: (callback: () => void, delayMs: number) => void = (callback, delayMs) => {
    globalThis.setTimeout(callback, delayMs);
  },
  dependencies?: Partial<CoordinatorDependencies>
) {
  const history = dependencies?.history ?? createVoiceInputHistory();
  const deps: CoordinatorDependencies = {
    history,
    loadPreferences:
      dependencies?.loadPreferences ??
      (async () =>
        (await loadSettings()).voiceInput ?? {
          language: 'ru-RU',
          microphoneDeviceId: null,
          mode: 'local-first',
        }),
    processor: dependencies?.processor ?? createVoiceInputProcessor({ history }),
  };
  const coordinator = new VoiceInputCoordinator(gateway, createInternalSessionId, schedule, deps);
  return {
    cleanupForPrivacyErasure: () => coordinator.cleanupForPrivacyErasure(),
    handleOffscreenEvent: (message: OffscreenVoiceInputEventMessage) =>
      coordinator.handleOffscreenEvent(message),
    registerPort: (port: chrome.runtime.Port) => coordinator.registerPort(port),
  };
}

const voiceInputCoordinator = createVoiceInputCoordinator();

export function registerVoiceInputPorts(): () => void {
  return browserRuntime.subscribeToConnections(voiceInputCoordinator.registerPort);
}

export function handleVoiceInputOffscreenEvent(message: OffscreenVoiceInputEventMessage): void {
  voiceInputCoordinator.handleOffscreenEvent(message);
}

export function cleanupVoiceInputForPrivacyErasure(): Promise<boolean> {
  return voiceInputCoordinator.cleanupForPrivacyErasure();
}
