import { describe, expect, it, vi } from 'vitest';
import {
  createRouteErrorResponse,
  respondAsyncRouteEffect,
  respondAsyncRoute,
  respondAsyncRouteWithLogger,
  respondAsyncSuccess,
} from './response';

async function flushRouterPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('router-response error helpers', () => {
  it('creates canonical route errors for static fallback messages', () => {
    expect(createRouteErrorResponse('Unknown message type')).toEqual({
      error: 'Unknown message type',
      success: false,
    });
  });
});

describe('router-response async helpers', () => {
  it('sends successful async route payloads through the shared response seam', async () => {
    const sendResponse = vi.fn();

    respondAsyncRoute(Promise.resolve({ success: true, value: 1 }), sendResponse);
    await flushRouterPromises();

    expect(sendResponse).toHaveBeenCalledWith({ success: true, value: 1 });
  });

  it('normalizes async route failures through getErrorMessage', async () => {
    const sendResponse = vi.fn();

    respondAsyncSuccess(Promise.reject(new Error('router boom')), sendResponse);
    await flushRouterPromises();

    expect(sendResponse).toHaveBeenCalledWith({
      error: 'router boom',
      success: false,
    });
  });
});

describe('router-response logging helpers', () => {
  it('logs async route failures before sending the normalized error response', async () => {
    const sendResponse = vi.fn();
    const logger = { error: vi.fn() };

    respondAsyncRouteWithLogger({
      work: Promise.reject(new Error('tab lookup failed')),
      sendResponse,
      logger,
      failureLogMessage: 'Background runtime message handling failed',
      fallbackMessage: 'Internal error',
    });
    await flushRouterPromises();

    expect(logger.error).toHaveBeenCalledWith(
      'Background runtime message handling failed',
      expect.any(Error)
    );
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'tab lookup failed',
      success: false,
    });
  });

  it('logs async side-effect route failures without sending a success payload', async () => {
    const sendResponse = vi.fn();
    const logger = { error: vi.fn() };

    respondAsyncRouteEffect({
      work: Promise.reject(new Error('tab lookup failed')),
      sendResponse,
      logger,
      failureLogMessage: 'Background runtime message handling failed',
      fallbackMessage: 'Internal error',
    });
    await flushRouterPromises();

    expect(logger.error).toHaveBeenCalledWith(
      'Background runtime message handling failed',
      expect.any(Error)
    );
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'tab lookup failed',
      success: false,
    });
  });
});
