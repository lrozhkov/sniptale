import { vi } from 'vitest';

export const voiceInputCoordinatorMocks = {
  acquireMediaMutationPermit: vi.fn(),
  ensureOffscreenDocument: vi.fn(),
  getRuntimeContexts: vi.fn(
    (_filter: chrome.runtime.ContextFilter): Promise<chrome.runtime.ExtensionContext[]> =>
      Promise.resolve([])
  ),
  sendRuntimeMessage: vi.fn(),
  waitForOffscreenReady: vi.fn(),
};
