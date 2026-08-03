import {
  VoiceInputPortMessageType,
  type OffscreenVoiceInputResponse,
  type VoiceInputPortRequest,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VoiceInputOffscreenGateway } from './offscreen-gateway';
import {
  createIdleVoiceInputSnapshot,
  createVoiceInputFailureEvent,
  createVoiceInputSnapshotEvent,
  isTerminalVoiceInputSnapshot,
  postVoiceInputPortEvent,
  translateVoiceInputSnapshot,
  type ActiveVoiceInputSession,
  type VoiceInputPortRegistration,
} from './protocol';
import type { VoiceInputSessionAuthority } from './session-authority';
import {
  compensateAmbiguousVoiceInputStart,
  dispatchVoiceInputStart,
  VoiceInputStartDispatchError,
} from './start-dispatch';

const logger = createLogger({ namespace: 'BackgroundSpeechRecognition' });

type VoiceInputStartRequest = Extract<
  VoiceInputPortRequest,
  { type: typeof VoiceInputPortMessageType.START }
>;

export class VoiceInputStartOperation {
  constructor(
    private readonly gateway: VoiceInputOffscreenGateway,
    private readonly sessions: VoiceInputSessionAuthority,
    private readonly createInternalSessionId: () => string
  ) {}

  async execute(
    registration: VoiceInputPortRegistration,
    request: VoiceInputStartRequest
  ): Promise<void> {
    const unresolvedStart = this.sessions.active;
    if (unresolvedStart?.startRollbackPending) {
      await this.recoverPendingRollback(unresolvedStart, request.requestId);
    }
    if (this.sessions.active) {
      postVoiceInputPortEvent(
        registration,
        createVoiceInputFailureEvent({
          errorCode: 'busy-speech',
          preferences: request.preferences,
          requestId: request.requestId,
          sessionId: request.sessionId,
        })
      );
      return;
    }

    const session = this.begin(registration, request);
    try {
      const response = await dispatchVoiceInputStart({
        gateway: this.gateway,
        isCurrent: () => this.sessions.owns(session) && !session.stopCleanupPending,
        preferences: request.preferences,
        requestId: request.requestId,
        session,
      });
      if (this.applyResponse(registration, session, request, response)) return;
      logger.debug('Voice input start dispatched', {
        consumerId: registration.consumerId,
        language: request.preferences.language,
        microphoneSelected: request.preferences.microphoneDeviceId !== null,
        requestedMode: request.preferences.mode,
        sessionId: request.sessionId,
      });
    } catch (error) {
      this.handleFailure(registration, session, request, error);
    }
  }

  private begin(
    registration: VoiceInputPortRegistration,
    request: VoiceInputStartRequest
  ): ActiveVoiceInputSession {
    const session: ActiveVoiceInputSession = {
      ...registration,
      offscreenObserved: false,
      offscreenSessionId: this.createInternalSessionId(),
      preferences: request.preferences,
      startRollbackPending: false,
      stopCleanupPending: false,
      sessionId: request.sessionId,
    };
    const snapshot: VoiceInputSnapshot = {
      ...createIdleVoiceInputSnapshot(request.preferences),
      phase: 'starting',
      sessionId: request.sessionId,
    };
    this.sessions.begin(session, snapshot);
    postVoiceInputPortEvent(registration, {
      requestId: request.requestId,
      snapshot,
      type: VoiceInputPortMessageType.SNAPSHOT,
    });
    return session;
  }

  private async recoverPendingRollback(
    session: ActiveVoiceInputSession,
    requestId: string
  ): Promise<void> {
    let recovered = false;
    try {
      recovered = await this.gateway.withMediaMutationPermit(() =>
        compensateAmbiguousVoiceInputStart(this.gateway, session, requestId)
      );
    } catch {
      logger.warn('Voice input start rollback retry failed', { sessionId: session.sessionId });
    }
    if (recovered && this.sessions.owns(session)) {
      this.sessions.reset(session.preferences);
    }
  }

  private applyResponse(
    registration: VoiceInputPortRegistration,
    session: ActiveVoiceInputSession,
    request: VoiceInputStartRequest,
    response: OffscreenVoiceInputResponse
  ): boolean {
    if (session.stopCleanupPending) return true;
    if (response.snapshot && isTerminalVoiceInputSnapshot(response.snapshot)) {
      if (this.sessions.owns(session)) {
        const translatedSnapshot = translateVoiceInputSnapshot(response.snapshot, session);
        this.sessions.replaceSnapshot(translatedSnapshot);
        this.sessions.clearIf(session);
        postVoiceInputPortEvent(
          registration,
          createVoiceInputSnapshotEvent(translatedSnapshot, request.requestId)
        );
      }
      logger.warn('Voice input Start was rejected by offscreen media ownership', {
        errorCode: response.snapshot.errorCode,
        sessionId: request.sessionId,
      });
      return true;
    }
    if (this.sessions.owns(session)) {
      session.offscreenObserved = true;
      if (response.snapshot) {
        const translatedSnapshot = translateVoiceInputSnapshot(response.snapshot, session);
        this.sessions.replaceSnapshot(translatedSnapshot);
        postVoiceInputPortEvent(
          session,
          createVoiceInputSnapshotEvent(translatedSnapshot, request.requestId)
        );
      }
    }
    return false;
  }

  private handleFailure(
    registration: VoiceInputPortRegistration,
    session: ActiveVoiceInputSession,
    request: VoiceInputStartRequest,
    error: unknown
  ): void {
    if (!this.sessions.owns(session) || session.stopCleanupPending) return;
    const errorCode =
      error instanceof Error && error.message === 'privacy-erasure-in-progress'
        ? 'privacy-erasure-in-progress'
        : 'offscreen-unavailable';
    const rollbackVerified =
      error instanceof VoiceInputStartDispatchError ? error.rollbackVerified : true;
    if (rollbackVerified) {
      this.sessions.clearIf(session);
    } else {
      session.startRollbackPending = true;
      logger.warn('Voice input start rollback remains unverified', {
        sessionId: request.sessionId,
      });
    }
    postVoiceInputPortEvent(
      registration,
      createVoiceInputFailureEvent({
        errorCode,
        preferences: request.preferences,
        requestId: request.requestId,
        sessionId: request.sessionId,
      })
    );
  }
}
