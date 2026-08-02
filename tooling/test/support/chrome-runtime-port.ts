import { vi } from 'vitest';

type Listener<TArgs extends unknown[]> = (...args: TArgs) => void;

function createChromeEventFixture<TArgs extends unknown[]>() {
  const listeners = new Set<Listener<TArgs>>();
  return {
    addListener: (listener: Listener<TArgs>) => listeners.add(listener),
    emit: (...args: TArgs) => {
      for (const listener of listeners) listener(...args);
    },
    removeListener: (listener: Listener<TArgs>) => listeners.delete(listener),
  };
}

export function createRuntimePortFixture(
  options: {
    name?: string;
    sender?: chrome.runtime.MessageSender;
  } = {}
) {
  const onMessage = createChromeEventFixture<[unknown]>();
  const onDisconnect = createChromeEventFixture<[chrome.runtime.Port]>();
  const postMessage = vi.fn();
  const disconnect = vi.fn();
  const port = {
    disconnect,
    name: options.name ?? '',
    onDisconnect,
    onMessage,
    postMessage,
    sender: options.sender,
  } as unknown as chrome.runtime.Port;
  return { disconnect, onDisconnect, onMessage, port, postMessage };
}
