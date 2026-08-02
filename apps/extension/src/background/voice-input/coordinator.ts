import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseVoiceInputPortRequest,
  parseVoiceInputServerEvent,
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

const logger = createLogger({ namespace: 'BackgroundSpeechRecognition' });

class VoiceInputCoordinator {
  private readonly sessions = new VoiceInputSessionAuthority();
  private readonly startOperation: VoiceInputStartOperation;

  constructor(
    private readonly gateway: VoiceInputOffscreenGateway,
    private readonly createInternalSessionId: () => string
  ) {
    this.startOperation = new VoiceInputStartOperation(
      gateway,
      this.sessions,
      createInternalSessionId
    );
  }

  registerPort(port: chrome.runtime.Port): void {
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
    const requestId = `privacy-erasure:${this.createInternalSessionId()}`;
    try {
      await this.gateway.ensureReady();
      const status = await this.gateway.send({
        requestId,
        type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
      });
      if (status?.success !== true || !status.snapshot) return false;
      const offscreenSessionId = status.snapshot.sessionId;
      if (offscreenSessionId && isActiveVoiceInputSnapshot(status.snapshot)) {
        const stopped = await this.gateway.send({
          force: true,
          requestId,
          sessionId: offscreenSessionId,
          type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
        });
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

  private disconnectPort(
    registration: VoiceInputPortRegistration,
    onMessage: (message: unknown) => void,
    onDisconnect: () => void
  ): void {
    registration.port.onMessage.removeListener(onMessage);
    registration.port.onDisconnect.removeListener(onDisconnect);
    if (this.sessions.active?.port === registration.port) {
      const session = this.sessions.active;
      void this.stopSession(session, `disconnect:${session.sessionId}`);
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
      void this.stopSession(this.sessions.active, request.requestId);
    }
  }

  private async refreshStatus(
    registration: VoiceInputPortRegistration,
    requestId: string
  ): Promise<void> {
    const sessionAtDispatch = this.sessions.active;
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
      logger.warn('Voice input status reconciliation failed', { requestId });
      postVoiceInputPortEvent(
        registration,
        createVoiceInputFailureEvent({ errorCode: 'offscreen-unavailable', requestId })
      );
    }
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
    logger.debug('Stopping voice input session', {
      acquireMutationPermit,
      requestId,
      sessionId: session.sessionId,
    });
    try {
      const sendStop = async () => {
        const response = await this.gateway.send({
          force: false,
          requestId,
          sessionId: session.offscreenSessionId,
          type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
        });
        if (response?.success !== true) throw new Error('offscreen-stop-rejected');
        if (this.sessions.active !== session) return;
        if (response.result === 'stale') {
          this.sessions.reset(session.preferences);
          postVoiceInputPortEvent(
            session,
            createVoiceInputFailureEvent({
              errorCode: 'offscreen-unavailable',
              preferences: session.preferences,
              requestId,
              sessionId: session.sessionId,
            })
          );
          return;
        }
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
          }
        }
      };
      if (acquireMutationPermit) await this.gateway.withMediaMutationPermit(sendStop);
      else await sendStop();
      return true;
    } catch {
      if (this.sessions.active !== session) return false;
      this.sessions.clearIf(session);
      postVoiceInputPortEvent(
        session,
        createVoiceInputFailureEvent({
          errorCode: 'offscreen-unavailable',
          preferences: session.preferences,
          requestId,
          sessionId: session.sessionId,
        })
      );
      return false;
    }
  }
}

function createInternalVoiceInputSessionId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) throw new Error('Voice input internal identity generation is unavailable.');
  return randomUUID.call(globalThis.crypto);
}

export function createVoiceInputCoordinator(
  gateway = createVoiceInputOffscreenGateway(),
  createInternalSessionId = createInternalVoiceInputSessionId
) {
  const coordinator = new VoiceInputCoordinator(gateway, createInternalSessionId);
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
