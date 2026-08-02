import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VOICE_INPUT_TELEMETRY_PORT_NAME,
  type VoiceInputPortMessageType,
  type VoiceInputServerEvent,
} from '@sniptale/runtime-contracts/voice-input';

const logger = createLogger({ namespace: 'OffscreenSpeechRecognition' });

type VoiceInputAudioLevelEvent = Extract<
  VoiceInputServerEvent,
  { type: typeof VoiceInputPortMessageType.AUDIO_LEVEL }
>;

type TelemetryPortLogger = Pick<typeof logger, 'debug' | 'warn'>;

type VoiceInputTelemetryPort = {
  close(): void;
  send(event: VoiceInputAudioLevelEvent): boolean;
};

export function createVoiceInputTelemetryPort(
  deps: {
    connect?: (connectInfo: chrome.runtime.ConnectInfo) => chrome.runtime.Port;
    logger?: TelemetryPortLogger;
  } = {}
): VoiceInputTelemetryPort {
  const connect = deps.connect ?? ((connectInfo) => browserRuntime.connect(connectInfo));
  const telemetryLogger = deps.logger ?? logger;
  let deliveryFailureLogged = false;
  let disconnectListener: (() => void) | null = null;
  let port: chrome.runtime.Port | null = null;

  const releasePort = (disconnect: boolean): void => {
    const current = port;
    const currentDisconnectListener = disconnectListener;
    port = null;
    disconnectListener = null;
    if (!current) return;
    if (currentDisconnectListener) {
      current.onDisconnect.removeListener(currentDisconnectListener);
    }
    if (!disconnect) return;
    try {
      current.disconnect();
    } catch {
      // The browser already owns cleanup for a disconnected telemetry Port.
    }
  };

  const resolvePort = (): chrome.runtime.Port => {
    if (port) return port;
    const connected = connect({ name: VOICE_INPUT_TELEMETRY_PORT_NAME });
    const onDisconnect = () => {
      if (port !== connected) return;
      connected.onDisconnect.removeListener(onDisconnect);
      port = null;
      disconnectListener = null;
      telemetryLogger.debug('Voice input telemetry Port disconnected; reconnecting on demand');
    };
    connected.onDisconnect.addListener(onDisconnect);
    port = connected;
    disconnectListener = onDisconnect;
    telemetryLogger.debug('Voice input telemetry Port connected');
    return connected;
  };

  return {
    close() {
      releasePort(true);
      deliveryFailureLogged = false;
    },
    send(event) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          resolvePort().postMessage(event);
          deliveryFailureLogged = false;
          return true;
        } catch {
          releasePort(false);
        }
      }
      if (!deliveryFailureLogged) {
        deliveryFailureLogged = true;
        telemetryLogger.warn('Voice input level telemetry is temporarily unavailable', {
          sessionId: event.sessionId,
        });
      }
      return false;
    },
  };
}
