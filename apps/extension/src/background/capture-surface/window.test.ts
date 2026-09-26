import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  displayInfo: vi.fn(),
  getWindow: vi.fn(),
  updateWindow: vi.fn(),
  subscribeBoundsChanged: vi.fn((_listener: (window: chrome.windows.Window) => void) => vi.fn()),
}));

vi.mock('@sniptale/platform/browser/displays', () => ({
  browserDisplays: { getInfo: mocks.displayInfo },
}));

vi.mock('@sniptale/platform/browser/windows', () => ({
  browserWindows: {
    get: mocks.getWindow,
    update: mocks.updateWindow,
    subscribeBoundsChanged: mocks.subscribeBoundsChanged,
  },
}));

import { applyPreparedWindowSize, prepareWindowSize, restoreWindowSnapshot } from './window';
import { CaptureSurfaceMutationError } from './types';

const prior = {
  type: 'window' as const,
  left: -1700,
  top: 40,
  width: 1600,
  height: 900,
  state: 'normal' as const,
};
const maximized = { ...prior, state: 'maximized' as const };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWindow.mockResolvedValue({ id: 3, ...prior });
  mocks.displayInfo.mockResolvedValue([
    {
      id: 'left',
      isPrimary: false,
      bounds: { left: -1920, top: 0, width: 1920, height: 1080 },
      workArea: { left: -1920, top: 0, width: 1920, height: 1040 },
    },
  ]);
  mocks.updateWindow.mockResolvedValue(undefined);
});

describe('capture-surface browser window operations', () => {
  it('prepares an exact normal-state size clamped inside a negative-coordinate work area', async () => {
    await expect(prepareWindowSize(3, 1280, 720)).resolves.toEqual({
      prior,
      expected: {
        type: 'window',
        left: -1700,
        top: 40,
        width: 1280,
        height: 720,
        state: 'normal',
      },
    });
  });

  it('sets exact bounds on a normal window and verifies the result', async () => {
    const expected = { ...prior, width: 1280, height: 720, state: 'normal' as const };
    mocks.getWindow.mockResolvedValue({ id: 3, ...expected });

    await expect(applyPreparedWindowSize(3, prior, expected)).resolves.toEqual(expected);

    expect(mocks.updateWindow).toHaveBeenCalledOnce();
    expect(mocks.updateWindow).toHaveBeenCalledWith(3, {
      left: expected.left,
      top: expected.top,
      width: expected.width,
      height: expected.height,
    });
  });

  it('normalizes a maximized window before applying exact bounds', async () => {
    const expected = { ...prior, width: 1280, height: 720, state: 'normal' as const };
    mocks.getWindow
      .mockResolvedValueOnce({ id: 3, ...maximized })
      .mockResolvedValueOnce({ id: 3, ...expected });

    await expect(prepareWindowSize(3, 1280, 720)).resolves.toEqual({
      prior: maximized,
      expected,
    });
    await expect(applyPreparedWindowSize(3, maximized, expected)).resolves.toEqual(expected);
    expect(mocks.updateWindow).toHaveBeenNthCalledWith(1, 3, { state: 'normal' });
    expect(mocks.updateWindow).toHaveBeenNthCalledWith(2, 3, {
      left: expected.left,
      top: expected.top,
      width: expected.width,
      height: expected.height,
    });
  });

  it('fails closed when the window manager clamps requested bounds', async () => {
    const expected = { ...prior, width: 1280, height: 720, state: 'normal' as const };
    mocks.getWindow.mockResolvedValue({ id: 3, ...expected, width: 1279 });

    const error = await applyPreparedWindowSize(3, prior, expected).catch((caught) => caught);
    expect(error).toBeInstanceOf(CaptureSurfaceMutationError);
    expect(error).toMatchObject({
      message: 'verification-failed',
      observedSnapshot: expect.objectContaining({ width: 1279 }),
    });
  });

  it('reports a normalized intermediate when bounds mutation fails', async () => {
    const expected = { ...prior, width: 1280, height: 720, state: 'normal' as const };
    mocks.updateWindow.mockRejectedValueOnce(new Error('bounds'));
    mocks.getWindow.mockResolvedValueOnce({ id: 3, ...prior });

    await expect(applyPreparedWindowSize(3, prior, expected)).rejects.toMatchObject({
      observedSnapshot: prior,
    });
  });

  it('restores exact bounds before restoring the prior maximized state', async () => {
    mocks.getWindow.mockResolvedValue({ id: 3, ...maximized });

    await restoreWindowSnapshot(3, maximized);

    expect(mocks.updateWindow).toHaveBeenNthCalledWith(1, 3, { state: 'normal' });
    expect(mocks.updateWindow).toHaveBeenNthCalledWith(2, 3, {
      left: maximized.left,
      top: maximized.top,
      width: maximized.width,
      height: maximized.height,
    });
    expect(mocks.updateWindow).toHaveBeenNthCalledWith(3, 3, { state: 'maximized' });
  });
});

it('waits for late bounds transitions to settle before completing restoration', async () => {
  vi.useFakeTimers();
  try {
    let onBoundsChanged: ((window: chrome.windows.Window) => void) | undefined;
    const unsubscribe = vi.fn();
    mocks.subscribeBoundsChanged.mockImplementationOnce((listener) => {
      onBoundsChanged = listener;
      return unsubscribe;
    });
    const completed = vi.fn();
    const restoration = restoreWindowSnapshot(3, prior).then(completed);
    await vi.advanceTimersByTimeAsync(0);
    expect(completed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    onBoundsChanged?.({
      id: 3,
      ...prior,
      type: 'normal',
      focused: true,
      alwaysOnTop: false,
      incognito: false,
    });
    await vi.advanceTimersByTimeAsync(150);
    expect(completed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    await restoration;
    expect(completed).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('bounds events from other windows do not postpone restoration', async () => {
  vi.useFakeTimers();
  try {
    let listener: ((window: chrome.windows.Window) => void) | undefined;
    mocks.subscribeBoundsChanged.mockImplementationOnce((callback) => {
      listener = callback;
      return vi.fn();
    });
    const completed = vi.fn();
    const restoration = restoreWindowSnapshot(3, prior).then(completed);
    await vi.advanceTimersByTimeAsync(200);
    listener?.({
      id: 9,
      ...prior,
      type: 'normal',
      focused: true,
      alwaysOnTop: false,
      incognito: false,
    });
    await vi.advanceTimersByTimeAsync(100);
    await restoration;
    expect(completed).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('bounds a failed restoration and removes its native listener', async () => {
  vi.useFakeTimers();
  try {
    const unsubscribe = vi.fn();
    mocks.subscribeBoundsChanged.mockReturnValueOnce(unsubscribe);
    mocks.getWindow.mockResolvedValue({ id: 3, ...prior, width: 100 });
    const failure = expect(restoreWindowSnapshot(3, prior)).rejects.toThrow('restore-impossible');
    await vi.advanceTimersByTimeAsync(2000);
    await failure;
    expect(unsubscribe).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
