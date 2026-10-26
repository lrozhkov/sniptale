import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  CONTENT_TEXT_PORT_NAME,
  parseContentTextClientMessage,
} from '../../../contracts/ai/content-text';
import { isContentTextSender } from './authorization/content-text';
import type { ContentTextJobService } from './content-text-job';

/** Each admitted Port owns one parsed request and cancels it on malformed input or disconnect. */
export function registerContentTextPorts(service: ContentTextJobService): () => void {
  return browserRuntime.subscribeToConnections((port) => {
    if (port.name !== CONTENT_TEXT_PORT_NAME) return;
    if (!isContentTextSender(port.sender)) {
      port.disconnect();
      return;
    }
    const connection = service.connect(port.sender, (message) => {
      try {
        port.postMessage(message);
      } catch {
        void connection.disconnect();
      }
    });
    const onMessage = (value: unknown) => {
      const message = parseContentTextClientMessage(value);
      if (!message) {
        port.disconnect();
        void connection.disconnect();
        return;
      }
      connection.receive(message);
    };
    const onDisconnect = () => {
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      void connection.disconnect();
    };
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  });
}
