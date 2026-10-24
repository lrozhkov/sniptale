import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  VOICE_INPUT_LOCAL_QUALITY,
  type OffscreenVoiceInputResponse,
  type VoiceInputPreferences,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VoiceInputOffscreenGateway } from './offscreen-gateway';
import { isActiveVoiceInputSnapshot, type ActiveVoiceInputSession } from './protocol';

const logger = createLogger({ namespace: 'BackgroundSpeechRecognition' });

export class VoiceInputStartDispatchError extends Error {
  constructor(readonly rollbackVerified: boolean) {
    super('offscreen-voice-input-start-failed');
  }
}

function isStartRollbackResolved(snapshot: VoiceInputSnapshot): boolean {
  return !isActiveVoiceInputSnapshot(snapshot);
}

export async function compensateAmbiguousVoiceInputStart(
  gateway: VoiceInputOffscreenGateway,
  session: ActiveVoiceInputSession,
  requestId: string,
  isCurrent: () => boolean
): Promise<boolean> {
  if (!isCurrent()) return false;
  try {
    const stopped = await gateway.send({
      force: true,
      requestId: `${requestId}:rollback-stop`,
      sessionId: session.offscreenSessionId,
      type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
    });
    if (!isCurrent()) return false;
    if (
      stopped?.success === true &&
      stopped.snapshot &&
      isStartRollbackResolved(stopped.snapshot)
    ) {
      logger.debug('Compensated ambiguous voice input start', { sessionId: session.sessionId });
      return true;
    }
  } catch {
    if (!isCurrent()) return false;
    logger.warn('Compensating voice input stop response was unavailable', {
      sessionId: session.sessionId,
    });
  }

  if (!isCurrent()) return false;
  try {
    const status = await gateway.send({
      requestId: `${requestId}:rollback-status`,
      type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
    });
    if (!isCurrent()) return false;
    const resolved =
      status?.success === true &&
      status.snapshot !== undefined &&
      isStartRollbackResolved(status.snapshot);
    logger.debug('Reconciled ambiguous voice input start', {
      resolved,
      sessionId: session.sessionId,
    });
    return resolved;
  } catch {
    if (!isCurrent()) return false;
    logger.warn('Ambiguous voice input start status was unavailable', {
      sessionId: session.sessionId,
    });
    return false;
  }
}

export async function dispatchVoiceInputStart(args: {
  gateway: VoiceInputOffscreenGateway;
  isCurrent(): boolean;
  preferences: VoiceInputPreferences;
  requestId: string;
  session: ActiveVoiceInputSession;
}): Promise<OffscreenVoiceInputResponse> {
  return args.gateway.withMediaMutationPermit(async () => {
    await args.gateway.ensureReady();
    if (!args.isCurrent() || !args.session.captureToken) throw new Error('stale-voice-input-start');
    try {
      const response = await args.gateway.send({
        captureToken: args.session.captureToken,
        maxDurationMs: args.session.maxDurationMs,
        preferences: args.preferences,
        quality: VOICE_INPUT_LOCAL_QUALITY,
        requestId: args.requestId,
        sessionId: args.session.offscreenSessionId,
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      });
      if (!args.isCurrent()) return response;
      if (response?.success !== true) throw new Error('offscreen-start-rejected');
      if (
        response.snapshot &&
        response.snapshot.sessionId !== null &&
        response.snapshot.sessionId !== args.session.offscreenSessionId
      ) {
        throw new Error('offscreen-start-session-mismatch');
      }
      return response;
    } catch {
      if (!args.isCurrent()) throw new VoiceInputStartDispatchError(false);
      const rollbackVerified = await compensateAmbiguousVoiceInputStart(
        args.gateway,
        args.session,
        args.requestId,
        args.isCurrent
      );
      throw new VoiceInputStartDispatchError(rollbackVerified);
    }
  });
}
