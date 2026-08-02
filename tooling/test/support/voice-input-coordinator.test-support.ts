import { vi } from 'vitest';

export const voiceInputCoordinatorMocks = {
  acquireMediaMutationPermit: vi.fn(),
  ensureOffscreenDocument: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  waitForOffscreenReady: vi.fn(),
};
