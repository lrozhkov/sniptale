// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mountMocks = vi.hoisted(() => ({
  finishOnFrameMock: vi.fn(),
  navigationSpan: { end: vi.fn(), fail: vi.fn() },
  popupSpan: { end: vi.fn(), fail: vi.fn() },
  renderPageShellMock: vi.fn(),
  startSpanMock: vi.fn(),
}));

vi.mock('../../../ui/page-bootstrap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/page-bootstrap')>()),
  renderPageShell: mountMocks.renderPageShellMock,
}));

vi.mock('./index', () => ({
  PopupApp: () => null,
}));

vi.mock('../../diagnostics/performance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../diagnostics/performance')>()),
  finishPopupPerfSpanOnNextFrame: mountMocks.finishOnFrameMock,
  startPopupPerfSpan: mountMocks.startSpanMock,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  vi.spyOn(performance, 'getEntriesByName').mockReturnValue([
    { startTime: 12 } as PerformanceEntry,
  ]);
  mountMocks.startSpanMock
    .mockReturnValueOnce(mountMocks.popupSpan)
    .mockReturnValueOnce(mountMocks.navigationSpan);
});

it('mounts the deferred popup application and closes both startup spans on render', async () => {
  await import('./entrypoint');

  expect(mountMocks.startSpanMock).toHaveBeenNthCalledWith(1, 'popup.startup');
  expect(mountMocks.startSpanMock).toHaveBeenNthCalledWith(
    2,
    'popup.navigation-to-first-react-shell',
    0
  );
  expect(mountMocks.renderPageShellMock).toHaveBeenCalledWith(
    expect.objectContaining({ namespace: 'PopupEntrypoint' })
  );

  const options = mountMocks.renderPageShellMock.mock.calls[0]?.[0] as
    | { onRendered?: () => void }
    | undefined;
  options?.onRendered?.();

  expect(mountMocks.finishOnFrameMock).toHaveBeenNthCalledWith(1, mountMocks.popupSpan);
  expect(mountMocks.finishOnFrameMock).toHaveBeenNthCalledWith(
    2,
    mountMocks.navigationSpan,
    expect.objectContaining({ entryEvaluatedAt: expect.any(Number) })
  );
});
