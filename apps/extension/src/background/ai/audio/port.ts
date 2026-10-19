import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { AUDIO_JOB_PORT_NAME, parseAudioJobClientMessage } from '../../../contracts/ai/audio';
import { getAudioJobSenderConsumer, isAudioJobAllowedForConsumer } from './authorization';
import type { AudioJobService } from './service';

/** Consumer-bound one-shot Port. Disconnect is cancellation, including worker termination. */
export function registerAudioJobPorts(service: AudioJobService): () => void {
  return browserRuntime.subscribeToConnections((port) => {
    if (port.name !== AUDIO_JOB_PORT_NAME) return;
    const consumer = getAudioJobSenderConsumer(port.sender);
    if (!consumer) {
      port.disconnect();
      return;
    }
    const connection = service.connect((message) => {
      try {
        port.postMessage(message);
      } catch {
        void connection.disconnect().catch(() => undefined);
      }
    }, consumer);
    const onMessage = (raw: unknown) => {
      const message = parseAudioJobClientMessage(raw);
      if (
        !message ||
        (message.type === 'start' && !isAudioJobAllowedForConsumer(message, consumer))
      ) {
        port.disconnect();
        void connection.disconnect().catch(() => undefined);
        return;
      }
      connection.receive(message);
    };
    const onDisconnect = () => {
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      void connection.disconnect().catch(() => undefined);
    };
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  });
}
