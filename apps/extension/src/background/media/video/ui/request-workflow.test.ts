import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runRequestWorkflow } from './request-workflow';

type RuntimeListener = (message: unknown, sender: chrome.runtime.MessageSender) => void;

function createWorkflowHarness() {
  let listener: RuntimeListener | null = null;
  const unsubscribe = vi.fn();

  return {
    emit(
      message: unknown,
      sender: chrome.runtime.MessageSender = {} as chrome.runtime.MessageSender
    ) {
      listener?.(message, sender);
    },
    subscribeToMessages: vi.fn((nextListener: RuntimeListener) => {
      listener = nextListener;
      return unsubscribe;
    }),
    unsubscribe,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function verifySingleSettlementAfterRequestFailure() {
  const harness = createWorkflowHarness();
  const onRequestError = vi.fn((_, finish: (result: string) => void) => {
    finish('request-error');
  });

  const resultPromise = runRequestWorkflow<string>({
    createListener: (finish) => () => {
      finish('listener-success');
    },
    onRequestError,
    onTimeout: vi.fn(),
    request: () => Promise.reject(new Error('request failed')),
    subscribeToMessages: harness.subscribeToMessages,
    timeoutMs: 1000,
  });

  harness.emit('listener-event');

  await expect(resultPromise).resolves.toBe('listener-success');
  await Promise.resolve();

  expect(onRequestError).toHaveBeenCalledOnce();
  expect(harness.unsubscribe).toHaveBeenCalledOnce();
}

async function verifyTimeoutSettlement() {
  vi.useFakeTimers();
  const harness = createWorkflowHarness();
  const onTimeout = vi.fn((finish: (result: string | null) => void) => {
    finish(null);
  });

  const resultPromise = runRequestWorkflow<string | null>({
    createListener: () => () => undefined,
    onRequestError: vi.fn(),
    onTimeout,
    request: () => new Promise(() => undefined),
    subscribeToMessages: harness.subscribeToMessages,
    timeoutMs: 500,
  });

  await vi.advanceTimersByTimeAsync(500);

  await expect(resultPromise).resolves.toBeNull();
  expect(onTimeout).toHaveBeenCalledOnce();
  expect(harness.unsubscribe).toHaveBeenCalledOnce();

  vi.useRealTimers();
}

async function verifySynchronousSettlementDuringSubscription() {
  vi.useFakeTimers();
  const unsubscribe = vi.fn();
  const request = vi.fn(() => Promise.resolve());
  const subscribeToMessages = vi.fn((listener: RuntimeListener) => {
    listener('listener-event', {} as chrome.runtime.MessageSender);
    return unsubscribe;
  });

  const resultPromise = runRequestWorkflow<string>({
    createListener: (finish) => () => {
      finish('listener-success');
    },
    onRequestError: vi.fn(),
    onTimeout: vi.fn(),
    request,
    subscribeToMessages,
    timeoutMs: 500,
  });

  await expect(resultPromise).resolves.toBe('listener-success');
  await vi.runAllTimersAsync();

  expect(request).not.toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalledOnce();

  vi.useRealTimers();
}

describe('runRequestWorkflow', () => {
  it(
    'settles only once when a request failure arrives after a successful listener result',
    verifySingleSettlementAfterRequestFailure
  );
  it('resolves through the timeout handler and unsubscribes the listener', verifyTimeoutSettlement);
  it(
    'does not start the request when the listener settles synchronously during subscription',
    verifySynchronousSettlementDuringSubscription
  );
});
