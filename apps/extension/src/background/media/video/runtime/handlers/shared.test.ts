import { expect, it, vi } from 'vitest';

import {
  createAsyncLifecycleRoute,
  HANDLED_ASYNC_RESULT,
  HANDLED_SYNC_RESULT,
  UNHANDLED_RESULT,
  shouldNotifyRecordingStartFailure,
} from './shared';

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

it('exposes the route result constants and start-failure guard', () => {
  expect(HANDLED_SYNC_RESULT).toEqual({ handled: true, keepChannelOpen: false });
  expect(UNHANDLED_RESULT).toEqual({ handled: false, keepChannelOpen: false });
  expect(shouldNotifyRecordingStartFailure()).toBe(true);
  expect(shouldNotifyRecordingStartFailure('start')).toBe(true);
  expect(shouldNotifyRecordingStartFailure('stop')).toBe(false);
  expect(shouldNotifyRecordingStartFailure('runtime')).toBe(false);
  expect(shouldNotifyRecordingStartFailure('export')).toBe(false);
});

it('sends deterministic lifecycle acks for async handler work', async () => {
  const sendResponse = vi.fn();
  const logger = { warn: vi.fn() };

  expect(createAsyncLifecycleRoute(Promise.resolve(), sendResponse, logger, 'failed')).toEqual(
    HANDLED_ASYNC_RESULT
  );
  await flushAsyncRoute();

  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(logger.warn).not.toHaveBeenCalled();
});

it('sends deterministic lifecycle failures when async handler work rejects', async () => {
  const sendResponse = vi.fn();
  const logger = { warn: vi.fn() };
  const error = new Error('boom');

  expect(createAsyncLifecycleRoute(Promise.reject(error), sendResponse, logger, 'failed')).toEqual(
    HANDLED_ASYNC_RESULT
  );
  await flushAsyncRoute();

  expect(logger.warn).toHaveBeenCalledWith('failed', error);
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Internal error' });
});
