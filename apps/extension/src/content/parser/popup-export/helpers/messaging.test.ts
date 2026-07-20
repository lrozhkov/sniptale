import { afterEach, expect, it, vi } from 'vitest';

const loggerSpy = vi.hoisted(() => ({
  debug: vi.fn(),
}));
const sendRuntimeMessageMock = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => loggerSpy,
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { emitPopupExportMessage } from './messaging';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

afterEach(() => {
  vi.restoreAllMocks();
});

it('swallows popup listener transport failures and logs the debug payload', async () => {
  sendRuntimeMessageMock.mockRejectedValue(new Error('listener missing'));

  await expect(
    emitPopupExportMessage({
      progress: { current: 1, errors: [], message: 'export', phase: 'done', total: 1 },
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_PROGRESS,
    })
  ).resolves.toBeUndefined();

  expect(loggerSpy.debug).toHaveBeenCalledWith('Popup listener is not available', {
    error: expect.any(Error),
  });
});
