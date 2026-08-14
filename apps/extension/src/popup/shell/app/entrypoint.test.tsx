// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const popupIndexMocks = vi.hoisted(() => ({
  entrypointLoadedMock: vi.fn(),
  performanceMarkMock: vi.fn(),
  requestAnimationFrameCallbacks: [] as FrameRequestCallback[],
}));

vi.mock('./entrypoint', () => {
  popupIndexMocks.entrypointLoadedMock();
  return {};
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  popupIndexMocks.requestAnimationFrameCallbacks.length = 0;
  vi.spyOn(performance, 'mark').mockImplementation(popupIndexMocks.performanceMarkMock);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    popupIndexMocks.requestAnimationFrameCallbacks.push(callback);
    return popupIndexMocks.requestAnimationFrameCallbacks.length;
  });
});

it('marks the minimal popup entry before loading the React application graph', async () => {
  await import('../..');

  expect(popupIndexMocks.performanceMarkMock).toHaveBeenCalledWith(
    'sniptale-popup-entry-evaluated'
  );
  expect(popupIndexMocks.entrypointLoadedMock).not.toHaveBeenCalled();

  popupIndexMocks.requestAnimationFrameCallbacks.shift()?.(16);
  expect(popupIndexMocks.entrypointLoadedMock).not.toHaveBeenCalled();

  popupIndexMocks.requestAnimationFrameCallbacks.shift()?.(32);
  await vi.waitFor(() => expect(popupIndexMocks.entrypointLoadedMock).toHaveBeenCalledTimes(1));
});
