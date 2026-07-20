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
  App: () => null,
}));

vi.mock('@sniptale/platform/observability/message-tracer', () => ({
  initTracer: initTracerMock,
}));

describe('video-editor index entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('renders the video editor through the shared shell with strict mode and tracing', async () => {
    await import('../../index');

    expect(initTracerMock).toHaveBeenCalledWith('video-editor');
    expect(renderPageShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'VideoEditorEntrypoint',
        strictMode: true,
      })
    );
  });
});
