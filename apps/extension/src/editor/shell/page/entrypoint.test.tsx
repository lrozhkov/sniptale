// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { initTracerMock, renderPageShellMock } = vi.hoisted(() => ({
  initTracerMock: vi.fn(),
  renderPageShellMock: vi.fn(),
}));

vi.mock('../../../ui/page-bootstrap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/page-bootstrap')>()),
  renderPageShell: renderPageShellMock,
}));

vi.mock('./', () => ({
  EditorPage: () => null,
}));

vi.mock('@sniptale/platform/observability/message-tracer', () => ({
  initTracer: initTracerMock,
}));

describe('editor index entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('routes the editor through the shared shell without a global runtime bootstrap listener', async () => {
    await import('../..');

    expect(initTracerMock).toHaveBeenCalledWith('editor');
    expect(renderPageShellMock).toHaveBeenCalledTimes(1);
    const options = renderPageShellMock.mock.calls[0]?.[0] as
      | { namespace: string; onRendered?: () => void }
      | undefined;

    expect(options?.namespace).toBe('EditorEntrypoint');
    expect(options?.onRendered).toBeUndefined();
  });
});
