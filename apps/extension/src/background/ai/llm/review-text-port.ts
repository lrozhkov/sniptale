import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  REVIEW_TEXT_PORT_NAME,
  parseReviewTextClientMessage,
} from '../../../contracts/ai/review-text';
import { isReviewTextSender } from './authorization/review-text';
import type { ReviewTextJobService } from './review-text-job';

export function registerReviewTextPorts(service: ReviewTextJobService): () => void {
  return browserRuntime.subscribeToConnections((port) => {
    if (port.name !== REVIEW_TEXT_PORT_NAME) return;
    if (!isReviewTextSender(port.sender)) {
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
      const message = parseReviewTextClientMessage(value);
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
