import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWebNavigation } from '@sniptale/platform/browser/web-navigation';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  DESIGN_REVIEW_SESSION_PORT,
  parseDesignReviewSessionRequest,
} from '../../contracts/design-review-session';
import { DesignReviewSessionStorage } from '../storage/design-review-session';
import { DesignReviewSessionService, type DesignReviewSessionSource } from './service';

const logger = createLogger({ namespace: 'DesignReviewSession' });
/** Native sender metadata supplies identity; content cannot select another tab or document. */
export function designReviewSessionSource(
  sender: chrome.runtime.MessageSender | undefined
): DesignReviewSessionSource | null {
  const tabId = sender?.tab?.id;
  if (
    !sender ||
    sender.id !== new URL(browserRuntime.getURL('')).hostname ||
    sender.frameId !== 0 ||
    sender.documentLifecycle !== 'active' ||
    !sender.documentId ||
    typeof tabId !== 'number' ||
    !Number.isSafeInteger(tabId) ||
    tabId < 0 ||
    !sender.url
  )
    return null;
  try {
    const url = new URL(sender.url);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? { tabId, documentId: sender.documentId }
      : null;
  } catch {
    return null;
  }
}
/** Rechecks the current native top document even when the worker missed navigation. */
export async function isCurrentDesignReviewDocument(
  source: DesignReviewSessionSource
): Promise<boolean> {
  const frames = await browserWebNavigation.getAllFrames({ tabId: source.tabId });
  return !!frames?.some((frame) => {
    if (
      frame.frameId !== 0 ||
      frame.documentId !== source.documentId ||
      frame.documentLifecycle !== 'active'
    )
      return false;
    try {
      const url = new URL(frame.url);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  });
}
export function registerDesignReviewSessionPorts(
  service: DesignReviewSessionService,
  restore?: (tabId: number) => Promise<void>
): () => void {
  const disconnect = browserRuntime.subscribeToConnections((port) => {
    if (port.name !== DESIGN_REVIEW_SESSION_PORT) return;
    const source = designReviewSessionSource(port.sender);
    if (!source) {
      port.disconnect();
      return;
    }
    const connection = service.connect(source, () => port.disconnect());
    const onMessage = (value: unknown) => {
      const request = parseDesignReviewSessionRequest(value);
      if (!request) {
        connection.disconnect();
        return;
      }
      void connection.request(request).then((reply) => {
        try {
          port.postMessage(reply);
        } catch {
          connection.disconnect();
        }
      });
    };
    const onDisconnect = () => {
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      connection.disconnect();
    };
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  });
  const navigation = browserWebNavigation.subscribeToCommitted((details) => {
    if (details.frameId === 0 && details.documentId)
      service.navigate(details.tabId, details.documentId);
  });
  const removed = browserTabs.subscribeToRemoved((tabId) => {
    void service.forgetTab(tabId).catch(() => logger.warn('Design Review session detach failed'));
  });
  const updated = browserTabs.subscribeToUpdated((tabId, change) => {
    if (change.status !== 'complete' || !restore) return;
    void service
      .shouldRestore(tabId)
      .then(async (active) => {
        if (active) await restore(tabId);
      })
      .catch(() => logger.warn('Design Review session restore failed'));
  });
  return () => {
    updated();
    disconnect();
    navigation();
    removed();
  };
}
/** Runtime composition creates and injects the single mutable session owner. */
export function createDesignReviewSessionService(): DesignReviewSessionService {
  return new DesignReviewSessionService({
    storage: new DesignReviewSessionStorage(),
    isCurrentDocument: isCurrentDesignReviewDocument,
  });
}
