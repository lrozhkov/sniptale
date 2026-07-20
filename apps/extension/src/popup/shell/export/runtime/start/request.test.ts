import { expect, it, vi } from 'vitest';

import { requestStartExport } from './request';

function createState() {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
    requestIdRef: { current: null as string | null },
    setProgress: vi.fn(),
    setResult: vi.fn(),
  };
}

it('requests popup export start with the selected options and request id', async () => {
  const state = createState();
  const sendStartMessage = vi.fn().mockResolvedValue({ success: true });

  await requestStartExport(state as never, 12, {
    createRequestId: () => 'req-1',
    sendStartMessage,
  } as never);

  expect(state.requestIdRef.current).toBe('req-1');
  expect(state.setResult).toHaveBeenCalledWith(null);
  expect(state.setProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'scanning' }));
  expect(sendStartMessage).toHaveBeenCalledWith(
    12,
    expect.objectContaining({
      requestId: 'req-1',
    })
  );
});

it('normalizes stale runtime failures when the start response is unsuccessful', async () => {
  const state = createState();

  await expect(
    requestStartExport(state as never, 12, {
      createRequestId: () => 'req-1',
      sendStartMessage: vi.fn().mockResolvedValue({
        error: 'Could not establish connection. Receiving end does not exist.',
        success: false,
      }),
    } as never)
  ).rejects.toThrow(
    'Страница использует устаревшую версию расширения. Обновите страницу и повторите действие.'
  );
});
