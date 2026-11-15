import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  CATALOG_PORT_NAME,
  loadCatalogMessages,
  parseBoundedCatalogMessages,
  parseCatalogRequest,
} from '../../platform/i18n/catalog-transport';

type CatalogPortOptions = {
  subscribe(listener: (port: chrome.runtime.Port) => void): () => void;
  getExtensionId(): string;
  load: typeof loadCatalogMessages;
  timeoutMs?: number;
};

function isContentSender(
  sender: chrome.runtime.MessageSender | undefined,
  extensionId: string
): boolean {
  if (
    sender?.id !== extensionId ||
    !Number.isInteger(sender.tab?.id) ||
    !Number.isInteger(sender.frameId) ||
    (sender.frameId ?? -1) < 0 ||
    typeof sender.documentId !== 'string' ||
    sender.documentId.length === 0 ||
    typeof sender.url !== 'string'
  )
    return false;
  try {
    return ['http:', 'https:', 'file:', 'about:'].includes(new URL(sender.url).protocol);
  } catch {
    return false;
  }
}

/** Serve bounded local translation data to checked content senders without exposing resources to pages. */
export function registerCatalogPorts(
  options: CatalogPortOptions = {
    subscribe: (listener) => browserRuntime.subscribeToConnections(listener),
    getExtensionId: () => new URL(browserRuntime.getURL('')).host,
    load: loadCatalogMessages,
  }
): () => void {
  const active = new Set<() => void>();
  const unsubscribe = options.subscribe((port) => {
    if (port.name !== CATALOG_PORT_NAME) return;
    if (!isContentSender(port.sender, options.getExtensionId()) || active.size >= 32) {
      port.disconnect();
      return;
    }
    let closed = false;
    let received = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      active.delete(close);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(close);
      try {
        port.disconnect();
      } catch {
        /* The sender can disconnect first. */
      }
    };
    const onMessage = (raw: unknown) => {
      const request = parseCatalogRequest(raw);
      if (received || !request || !['content', 'content-shim'].includes(request.profile)) {
        close();
        return;
      }
      received = true;
      void options
        .load(request.locale, request.profile)
        .then(parseBoundedCatalogMessages)
        .then((messages) => {
          if (!closed) port.postMessage({ ...request, messages });
        })
        .catch(() => {
          if (!closed) {
            try {
              port.postMessage({ error: 'catalog-unavailable' });
            } catch {
              close();
            }
          }
        })
        .finally(close);
    };
    const timer = setTimeout(close, options.timeoutMs ?? 10_000);
    active.add(close);
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(close);
  });
  return () => {
    unsubscribe();
    for (const close of active) close();
  };
}
