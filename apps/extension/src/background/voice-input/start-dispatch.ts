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
  requestId: string
): Promise<boolean> {
  try {
    const stopped = await gateway.send({
      force: true,
      requestId: `${requestId}:rollback-stop`,
      sessionId: session.offscreenSessionId,
      type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
    });
    if (
      stopped?.success === true &&
      stopped.snapshot &&
      isStartRollbackResolved(stopped.snapshot)
    ) {
      logger.debug('Compensated ambiguous voice input start', { sessionId: session.sessionId });
      return true;
    }
  } catch {
    logger.warn('Compensating voice input stop response was unavailable', {
      sessionId: session.sessionId,
    });
  }

  try {
    const status = await gateway.send({
      requestId: `${requestId}:rollback-status`,
      type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
    });
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
    if (!args.isCurrent()) throw new Error('stale-voice-input-start');
    try {
      const response = await args.gateway.send({
        preferences: args.preferences,
        quality: VOICE_INPUT_LOCAL_QUALITY,
        requestId: args.requestId,
        sessionId: args.session.offscreenSessionId,
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      });
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
      const rollbackVerified = await compensateAmbiguousVoiceInputStart(
        args.gateway,
        args.session,
        args.requestId
      );
      throw new VoiceInputStartDispatchError(rollbackVerified);
    }
  });
}
