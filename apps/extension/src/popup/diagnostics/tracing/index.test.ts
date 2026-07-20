// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initTracerMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/message-tracer', () => ({
  initTracer: mocks.initTracerMock,
}));

import { initializePopupTracer } from './index';

describe('initializePopupTracer', () => {
  beforeEach(() => {
    mocks.initTracerMock.mockReset();
    window.localStorage.clear();
  });

  it('skips tracer loading when the flag is disabled', async () => {
    initializePopupTracer();
    await Promise.resolve();

    expect(mocks.initTracerMock).not.toHaveBeenCalled();
  });

  it('loads the popup tracer when the flag is enabled', async () => {
    window.localStorage.setItem('sniptale.popup.trace', '1');

    initializePopupTracer();
    await vi.dynamicImportSettled();
    await Promise.resolve();

    expect(mocks.initTracerMock).toHaveBeenCalledWith('popup');
  });
});
