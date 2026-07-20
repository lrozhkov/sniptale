import { vi } from 'vitest';

interface EmbeddedEditorUrlMocks {
  buildEditorUrlMock: ReturnType<typeof vi.fn>;
  createEditorSessionIdMock: ReturnType<typeof vi.fn>;
}

const embeddedEditorUrlMocks = vi.hoisted(() => {
  const mocks = {
    buildEditorUrlMock: vi.fn(),
    createEditorSessionIdMock: vi.fn(),
  };
  (
    globalThis as unknown as {
      __embeddedEditorUrlMocks: EmbeddedEditorUrlMocks;
    }
  ).__embeddedEditorUrlMocks = mocks;
  return mocks;
});

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: embeddedEditorUrlMocks.createEditorSessionIdMock,
}));

vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: embeddedEditorUrlMocks.buildEditorUrlMock,
}));

export function getEmbeddedEditorUrlMocks(): EmbeddedEditorUrlMocks {
  return (
    globalThis as unknown as {
      __embeddedEditorUrlMocks: EmbeddedEditorUrlMocks;
    }
  ).__embeddedEditorUrlMocks;
}
