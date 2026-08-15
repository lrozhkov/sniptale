// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let resolveMessageModule!: () => void;
  const messageModuleReady = new Promise<void>((resolve) => {
    resolveMessageModule = resolve;
  });
  return {
    dispose: vi.fn(),
    messageModuleReady,
    resolveMessageModule,
    subscribe: vi.fn(),
  };
});

vi.mock('../message-sync', async () => {
  await mocks.messageModuleReady;
  return {
    subscribeToRecordingMessages: (handlers: unknown) => {
      mocks.subscribe(handlers);
      return mocks.dispose;
    },
  };
});

vi.mock('./coordinator', () => ({
  resolvePopupStartupRoute: () => new Promise(() => undefined),
}));

vi.mock('./resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./resource')>()),
  loadPopupRoute: vi.fn(),
  preloadPopupPage: vi.fn(),
}));

it('disposes a recording subscription whose module resolves after effect cleanup', async () => {
  const { usePopupRouteController } = await import('./use-route-controller');
  function Harness() {
    usePopupRouteController();
    return null;
  }

  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  act(() => root.unmount());

  mocks.resolveMessageModule();

  await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce());
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
