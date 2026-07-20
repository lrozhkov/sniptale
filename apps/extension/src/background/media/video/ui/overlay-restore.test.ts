import { beforeEach, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const { sendTabMessage } = vi.hoisted(() => ({
  sendTabMessage: vi.fn(),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendTabMessage,
}));

import { restoreRecordingOverlayAfterNavigation } from './overlay-restore';

const region = { x: 10, y: 20, width: 300, height: 200 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  installBackgroundRuntimeMessagingMock({ sendTabMessage });
});

it('retries overlay restoration until a send succeeds', async () => {
  sendTabMessage.mockRejectedValueOnce(new Error('not ready')).mockResolvedValueOnce(undefined);

  const restorePromise = restoreRecordingOverlayAfterNavigation(42, region, () => true, [0, 250]);

  await vi.runAllTimersAsync();
  await expect(restorePromise).resolves.toBeUndefined();

  expect(sendTabMessage).toHaveBeenNthCalledWith(1, 42, {
    type: 'SHOW_RECORDING_OVERLAY',
    region,
  });
  expect(sendTabMessage).toHaveBeenCalledTimes(2);
});

it('stops retrying when the restore predicate returns false', async () => {
  sendTabMessage.mockResolvedValue(undefined);

  const restorePromise = restoreRecordingOverlayAfterNavigation(42, region, () => false, [0, 250]);

  await vi.runAllTimersAsync();
  await expect(restorePromise).resolves.toBeUndefined();

  expect(sendTabMessage).not.toHaveBeenCalled();
});
