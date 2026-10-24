import {
  VoiceInputPortMessageType,
  type OffscreenVoiceInputResponse,
  type VoiceInputPortRequest,
  type VoiceInputSnapshot,
  type VoiceInputPreferences,
} from '@sniptale/runtime-contracts/voice-input';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VoiceInputHistory } from '../../composition/persistence/voice-input-history';
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
    private readonly createInternalSessionId: () => string,
    private readonly history: VoiceInputHistory,
    private readonly loadPreferences: () => Promise<VoiceInputPreferences>
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
          preferences: this.sessions.active.preferences,
          requestId: request.requestId,
          sessionId: request.sessionId,
        })
      );
      return;
    }

    const session = this.begin(registration, request);
    try {
      const preferences = await this.loadPreferences();
      if (!this.ownsCaptureStart(session)) return;
      session.preferences = preferences;
      await this.gateway.withMediaMutationPermit(async () => {
        if (!this.ownsCaptureStart(session)) return;
        await this.history.initialize();
        if (!this.ownsCaptureStart(session)) return;
        const captureToken = await this.history.beginCapture();
        if (this.ownsCaptureStart(session)) session.captureToken = captureToken;
      });
      if (!this.ownsCaptureStart(session)) return;
      const response = await dispatchVoiceInputStart({
        gateway: this.gateway,
        isCurrent: () => this.ownsCaptureStart(session),
        preferences: session.preferences,
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

  private ownsCaptureStart(session: ActiveVoiceInputSession): boolean {
    return (
      this.sessions.owns(session) &&
      !session.cancelled &&
      !session.stopCleanupPending &&
      !session.captureReleased &&
      !session.processing
    );
  }

  private begin(
    registration: VoiceInputPortRegistration,
    request: VoiceInputStartRequest
  ): ActiveVoiceInputSession {
    const session: ActiveVoiceInputSession = {
      ...registration,
      offscreenObserved: false,
      offscreenSessionId: this.createInternalSessionId(),
      preferences: { language: 'ru-RU', mode: 'local-first', microphoneDeviceId: null },
      startRollbackPending: false,
      stopCleanupPending: false,
      sessionId: request.sessionId,
    };
    const snapshot: VoiceInputSnapshot = {
      ...createIdleVoiceInputSnapshot(session.preferences),
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
    if (!session.startRollbackPending || !this.ownsCaptureStart(session)) return;
    let recovered = false;
    try {
      recovered = await this.gateway.withMediaMutationPermit(() =>
        compensateAmbiguousVoiceInputStart(this.gateway, session, requestId, () =>
          this.ownsCaptureStart(session)
        )
      );
    } catch {
      logger.warn('Voice input start rollback retry failed', { sessionId: session.sessionId });
    }
    if (recovered && session.startRollbackPending && this.ownsCaptureStart(session)) {
      this.sessions.reset(session.preferences);
    }
  }

  private applyResponse(
    registration: VoiceInputPortRegistration,
    session: ActiveVoiceInputSession,
    request: VoiceInputStartRequest,
    response: OffscreenVoiceInputResponse
  ): boolean {
    if (!this.ownsCaptureStart(session)) return true;
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
    if (!this.ownsCaptureStart(session)) return;
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
        preferences: session.preferences,
        requestId: request.requestId,
        sessionId: request.sessionId,
      })
    );
  }
}
