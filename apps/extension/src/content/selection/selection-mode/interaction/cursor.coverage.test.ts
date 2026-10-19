// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mountStyleMock: vi.fn(),
}));

vi.mock('../../../platform/frame', () => ({
  mountStyleInAccessibleDocuments: mocks.mountStyleMock,
}));

import {
  createSelectionCrosshairCursor,
  disableSelectionModeCursor,
  enableSelectionModeCursor,
} from './cursor';

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.style.removeProperty('--sniptale-color-accent');
});

it('ignores the current accent color when mounting the selection cursor', () => {
  document.documentElement.style.setProperty('--sniptale-color-accent', '#123456');
  const previousCleanup = vi.fn();
  const nextCleanup = vi.fn();
  mocks.mountStyleMock.mockReturnValue(nextCleanup);
  const state = { cursorStyleCleanup: previousCleanup };

  enableSelectionModeCursor(state);
  disableSelectionModeCursor(state);

  expect(previousCleanup).toHaveBeenCalledOnce();
  expect(mocks.mountStyleMock).toHaveBeenCalledWith(
    expect.objectContaining({
      textContent: expect.stringContaining('cursor: crosshair !important'),
    })
  );
  expect(nextCleanup).toHaveBeenCalledOnce();
  expect(state.cursorStyleCleanup).toBeNull();
});

it.each(['', '#f97316', '#123456'])('uses a native crosshair with accent %s', (accent) => {
  document.documentElement.style.setProperty('--sniptale-color-accent', accent);

  expect(createSelectionCrosshairCursor()).toBe('crosshair');
});
