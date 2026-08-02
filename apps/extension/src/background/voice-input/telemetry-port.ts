import { hasOffscreenRuntimeCapability } from '../offscreen-document/sender-policy';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLogger } from '@sniptale/platform/observability/logger';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseVoiceInputServerEvent,
  VOICE_INPUT_TELEMETRY_PORT_NAME,
  VoiceInputPortMessageType,
  type VoiceInputServerEvent,
} from '@sniptale/runtime-contracts/voice-input';
import { handleVoiceInputOffscreenEvent } from './coordinator';

const logger = createLogger({ namespace: 'BackgroundSpeechRecognition' });

type VoiceInputAudioLevelEvent = Extract<
  VoiceInputServerEvent,
  { type: typeof VoiceInputPortMessageType.AUDIO_LEVEL }
>;

type TelemetryPortLogger = {
  debug(message: string): void;
  warn(message: string): void;
};

export function registerVoiceInputTelemetryPort(args: {
  logger: TelemetryPortLogger;
  onLevel(event: VoiceInputAudioLevelEvent): void;
  port: chrome.runtime.Port;
}): boolean {
  if (args.port.name !== VOICE_INPUT_TELEMETRY_PORT_NAME) return false;
  if (!args.port.sender || !hasOffscreenRuntimeCapability(args.port.sender)) {
    args.logger.warn('Rejected unauthorized voice input telemetry Port');
    args.port.disconnect();
    return true;
  }

  const onMessage = (message: unknown) => {
    const event = parseVoiceInputServerEvent(message);
    if (!event || event.type !== VoiceInputPortMessageType.AUDIO_LEVEL) {
      args.logger.warn('Rejected malformed voice input telemetry frame');
      args.port.disconnect();
      return;
    }
    args.onLevel(event);
  };
  const onDisconnect = () => {
    args.port.onMessage.removeListener(onMessage);
    args.port.onDisconnect.removeListener(onDisconnect);
    args.logger.debug('Voice input telemetry Port disconnected');
  };
  args.port.onMessage.addListener(onMessage);
  args.port.onDisconnect.addListener(onDisconnect);
  args.logger.debug('Voice input telemetry Port connected');
  return true;
}

export function registerVoiceInputTelemetryPorts(): () => void {
  return browserRuntime.subscribeToConnections((port) => {
    registerVoiceInputTelemetryPort({
      logger,
      onLevel: (event) =>
        handleVoiceInputOffscreenEvent({
          event,
          type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
        }),
      port,
    });
  });
}
