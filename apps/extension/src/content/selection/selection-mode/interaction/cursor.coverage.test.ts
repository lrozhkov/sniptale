// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mountStyleMock: vi.fn(),
}));

vi.mock('../../../platform/frame', () => ({
  mountStyleInAccessibleDocuments: mocks.mountStyleMock,
}));

import { disableSelectionModeCursor, enableSelectionModeCursor } from './cursor';

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.style.removeProperty('--sniptale-color-accent');
});

it('uses the current accent color when mounting the selection cursor', () => {
  document.documentElement.style.setProperty('--sniptale-color-accent', '#123456');
  const previousCleanup = vi.fn();
  const nextCleanup = vi.fn();
  mocks.mountStyleMock.mockReturnValue(nextCleanup);
  const state = { cursorStyleCleanup: previousCleanup } as any;

  enableSelectionModeCursor(state);
  disableSelectionModeCursor(state);

  expect(previousCleanup).toHaveBeenCalledOnce();
  expect(mocks.mountStyleMock).toHaveBeenCalledWith(
    expect.objectContaining({ textContent: expect.stringContaining('%23123456') })
  );
  expect(nextCleanup).toHaveBeenCalledOnce();
  expect(state.cursorStyleCleanup).toBeNull();
});

it('falls back to the default cursor color when no accent is defined', () => {
  enableSelectionModeCursor({ cursorStyleCleanup: null } as any);

  expect(mocks.mountStyleMock).toHaveBeenCalledWith(
    expect.objectContaining({ textContent: expect.stringContaining('%233b82f6') })
  );
});
