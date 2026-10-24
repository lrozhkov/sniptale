import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  createSpeechRecognitionSession,
  loadSpeechRecognitionAvailability,
  resolveSpeechRecognitionApi,
} from '@sniptale/platform/browser/speech-recognition';
import {
  acquireMicrophoneInput,
  observeMicrophoneLevel,
} from '@sniptale/platform/browser/user-media';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseOffscreenVoiceInputRuntimeMessage,
  VoiceInputPortMessageType,
  type OffscreenVoiceInputCommand,
  type OffscreenVoiceInputResponse,
  type VoiceInputServerEvent,
  type VoiceInputCaptureEvent,
} from '@sniptale/runtime-contracts/voice-input';
import { createRuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { authorizeOffscreenRuntimeCommand } from '../runtime/authorization';
import { executeOffscreenResponseCommand } from '../runtime/idempotency';
import { createVoiceInputHistory } from '../../composition/persistence/voice-input-history';
import { createVoiceAudioCapture } from './audio-capture';
import { normalizeVoiceAudio } from './audio-input';
import { createOffscreenVoiceInputService } from './service';
import { createVoiceInputTelemetryPort } from './telemetry-port';

const logger = createLogger({ namespace: 'OffscreenSpeechRecognition' });
const runtimeMessaging = createRuntimeMessagingTransport();
const telemetryPort = createVoiceInputTelemetryPort();

function emitVoiceInputEvent(
  event: VoiceInputServerEvent | VoiceInputCaptureEvent
): Promise<unknown> {
  if (event.type === VoiceInputPortMessageType.AUDIO_LEVEL) {
    return Promise.resolve({ delivered: telemetryPort.send(event) });
  }
  if (
    event.type === VoiceInputPortMessageType.FAILURE ||
    (event.type === VoiceInputPortMessageType.SNAPSHOT &&
      (event.snapshot.phase === 'ended' || event.snapshot.phase === 'error'))
  ) {
    telemetryPort.close();
  }
  return runtimeMessaging.sendRuntimeMessage({
    type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    event,
  });
}

function isVoiceInputCommandCandidate(message: unknown): message is Record<string, unknown> {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false;
  return (
    message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS ||
    message.type === MessageType.OFFSCREEN_VOICE_INPUT_START ||
    message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP
  );
}

const history = createVoiceInputHistory();
const service = createOffscreenVoiceInputService({
  createCapture: createVoiceAudioCapture,
  normalizeAudio: normalizeVoiceAudio,
  publishAudio: (token, input, signal) => history.publishAudio(token, input, signal),
  acquireMicrophone: acquireMicrophoneInput,
  createRecognition: createSpeechRecognitionSession,
  emit: emitVoiceInputEvent,
  loadAvailability: loadSpeechRecognitionAvailability,
  observeMicrophoneLevel,
  resolveApi: resolveSpeechRecognitionApi,
});

function routeCommand(
  command: OffscreenVoiceInputCommand
): OffscreenVoiceInputResponse | Promise<OffscreenVoiceInputResponse> {
  if (command.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS) {
    return { success: true, snapshot: service.getSnapshot() };
  }
  if (command.type === MessageType.OFFSCREEN_VOICE_INPUT_START) {
    const snapshot = service.start({
      captureToken: command.captureToken,
      maxDurationMs: command.maxDurationMs,
      preferences: command.preferences,
      requestId: command.requestId,
      sessionId: command.sessionId,
    });
    return { success: true, result: 'accepted', snapshot };
  }
  const result = service.stop(command.sessionId, command.force);
  if (command.force)
    return service.drain().then(() => ({ success: true, result, snapshot: service.getSnapshot() }));
  return { success: true, result, snapshot: service.getSnapshot() };
}

function routeDuplicateCommand(
  completion: Promise<OffscreenVoiceInputResponse>,
  responseHandler: ResponseSender | undefined
): boolean | undefined {
  if (!responseHandler) return undefined;
  void completion.then(
    (response) => responseHandler(response),
    () => responseHandler({ success: false, error: 'Voice input command failed' })
  );
  return true;
}

export function registerOffscreenVoiceInputMessageListener(): void {
  browserRuntime.subscribeToMessages((message: unknown, sender, sendResponse) => {
    if (!isVoiceInputCommandCandidate(message)) return;
    const responseHandler = sendResponse as ResponseSender | undefined;
    const authorization = authorizeOffscreenRuntimeCommand({
      message,
      sender,
      ...(responseHandler === undefined ? {} : { responseHandler }),
    });
    if (!authorization.authorized) {
      logger.warn('Rejected voice input command', {
        reason: authorization.reason,
        type: message['type'],
      });
      return responseHandler ? false : undefined;
    }
    const parsed = parseOffscreenVoiceInputRuntimeMessage(authorization.message);
    if (!parsed || parsed.type === MessageType.OFFSCREEN_VOICE_INPUT_EVENT) {
      logger.warn('Rejected malformed voice input command', { type: message['type'] });
      responseHandler?.({ success: false, error: 'Invalid voice input command' });
      return responseHandler ? false : undefined;
    }
    try {
      const execution = executeOffscreenResponseCommand({
        capabilityGeneration: authorization.capabilityGeneration,
        execute: () => routeCommand(parsed),
        message: parsed,
      });
      if (execution.duplicate) {
        logger.warn('Replayed duplicate voice input command response', { type: parsed.type });
        return routeDuplicateCommand(
          execution.completion.then((response) => response),
          responseHandler
        );
      }
      if (execution.response instanceof Promise)
        return routeDuplicateCommand(execution.response, responseHandler);
      responseHandler?.(execution.response);
    } catch {
      logger.warn('Voice input command execution failed', { type: parsed.type });
      responseHandler?.({ success: false, error: 'Voice input command failed' });
    }
    return responseHandler ? false : undefined;
  });

  globalThis.addEventListener?.('beforeunload', () => {
    telemetryPort.close();
    service.abortOnUnload();
  });
}
