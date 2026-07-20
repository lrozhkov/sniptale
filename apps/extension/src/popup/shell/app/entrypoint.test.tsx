// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const popupIndexMocks = vi.hoisted(() => ({
  finishPopupPerfSpanOnNextFrameMock: vi.fn(),
  PageBootstrapErrorBoundaryMock: vi.fn(),
  popupSpan: { end: vi.fn(), fail: vi.fn() },
  renderPageShellMock: vi.fn(),
  startPopupPerfSpanMock: vi.fn(),
  trackPopupPerfAsyncMock: vi.fn(),
}));

vi.mock('../../../ui/page-bootstrap', () => ({
  PageBootstrapErrorBoundary: popupIndexMocks.PageBootstrapErrorBoundaryMock,
  renderPageShell: popupIndexMocks.renderPageShellMock,
}));

vi.mock('./index', () => ({
  PopupApp: () => null,
}));

vi.mock('../../diagnostics/performance', () => ({
  finishPopupPerfSpanOnNextFrame: popupIndexMocks.finishPopupPerfSpanOnNextFrameMock,
  startPopupPerfSpan: popupIndexMocks.startPopupPerfSpanMock,
  trackPopupPerfAsync: popupIndexMocks.trackPopupPerfAsyncMock,
}));

describe('popup index entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    popupIndexMocks.startPopupPerfSpanMock.mockReturnValue(popupIndexMocks.popupSpan);
  });

  it('renders the popup through the shared shell and preserves the perf callback', async () => {
    await import('../..');

    expect(popupIndexMocks.renderPageShellMock).toHaveBeenCalledTimes(1);
    const options = popupIndexMocks.renderPageShellMock.mock.calls[0]?.[0] as
      | { onRendered?: () => void; namespace: string }
      | undefined;

    expect(options?.namespace).toBe('PopupEntrypoint');
    options?.onRendered?.();
    expect(popupIndexMocks.finishPopupPerfSpanOnNextFrameMock).toHaveBeenCalledWith(
      popupIndexMocks.popupSpan
    );
  });
});
