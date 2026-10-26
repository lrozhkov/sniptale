import { browserRuntime } from '@sniptale/platform/browser/runtime';

interface TextPortConnection<Request> {
  receive(message: Request): void;
  disconnect(): Promise<void>;
}

interface TextPortAdapter<Request, Server> {
  name: string;
  isSender(
    sender: chrome.runtime.MessageSender | undefined
  ): sender is chrome.runtime.MessageSender;
  parse(value: unknown): Request | null;
  connect(
    sender: chrome.runtime.MessageSender,
    send: (message: Server) => void
  ): TextPortConnection<Request>;
}

/** Binds one text protocol's validated sender and commands to its cancellable connection. */
export function registerTextJobPort<Request, Server>(
  adapter: TextPortAdapter<Request, Server>
): () => void {
  return browserRuntime.subscribeToConnections((port) => {
    if (port.name !== adapter.name) return;
    if (!adapter.isSender(port.sender)) {
      port.disconnect();
      return;
    }
    const connection = adapter.connect(port.sender, (message) => {
      try {
        port.postMessage(message);
      } catch {
        void connection.disconnect();
      }
    });
    const onMessage = (value: unknown) => {
      const message = adapter.parse(value);
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
