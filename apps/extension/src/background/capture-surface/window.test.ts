import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  displayInfo: vi.fn(),
  getWindow: vi.fn(),
  updateWindow: vi.fn(),
  subscribeBoundsChanged: vi.fn((_listener: (window: chrome.windows.Window) => void) => vi.fn()),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn: mocks.warn }),
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

describe('browser window sizing and normalization', () => {
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

    expect(mocks.warn).not.toHaveBeenCalled();
    expect(mocks.updateWindow).toHaveBeenCalledOnce();
    expect(mocks.updateWindow).toHaveBeenCalledWith(3, {
      left: expected.left,
      top: expected.top,
      width: expected.width,
      height: expected.height,
    });
  });

  it('accepts Chrome-adjusted position when the requested size and normal state settle', async () => {
    const expected = { ...prior, width: 1280, height: 720, state: 'normal' as const };
    const observed = { ...expected, left: expected.left + 8, top: expected.top + 8 };
    mocks.getWindow.mockResolvedValue({ id: 3, ...observed });
    mocks.updateWindow.mockResolvedValue({ id: 3, ...observed });

    await expect(applyPreparedWindowSize(3, prior, expected)).resolves.toEqual(observed);
  });

  it('rejects a position change after Chrome reports the applied bounds', async () => {
    const expected = { ...prior, width: 1280, height: 720, state: 'normal' as const };
    mocks.updateWindow.mockResolvedValue({ id: 3, ...expected });
    mocks.getWindow.mockResolvedValue({ id: 3, ...expected, left: expected.left + 8 });

    await expect(applyPreparedWindowSize(3, prior, expected)).rejects.toMatchObject({
      message: 'verification-failed',
    });
  });

  it('normalizes a maximized window before applying exact bounds', async () => {
    const expected = { ...prior, width: 1280, height: 720, state: 'normal' as const };
    mocks.getWindow
      .mockResolvedValueOnce({ id: 3, ...maximized })
      .mockResolvedValue({ id: 3, ...expected });

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

  it('waits for a maximized window to finish its native resize transition', async () => {
    vi.useFakeTimers();
    try {
      const expected = { ...prior, width: 1280, height: 720, state: 'normal' as const };
      mocks.getWindow
        .mockResolvedValueOnce({ id: 3, ...maximized })
        .mockResolvedValueOnce({ id: 3, ...prior })
        .mockResolvedValue({ id: 3, ...expected });

      const prepared = await prepareWindowSize(3, 1280, 720);
      const resize = applyPreparedWindowSize(3, prepared.prior, prepared.expected);
      const result = expect(resize).resolves.toEqual(expected);
      await vi.advanceTimersByTimeAsync(500);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('browser window transition and bounds retry', () => {
  it('waits for Chrome to restore a maximized window before sending bounds', async () => {
    vi.useFakeTimers();
    try {
      const expected = { ...prior, width: 1280, height: 720, state: 'normal' as const };
      let current: Omit<typeof prior, 'state'> & { state: 'normal' | 'maximized' } = maximized;
      let normalReads = 0;
      mocks.getWindow.mockImplementation(async () => {
        if (mocks.updateWindow.mock.calls.some(([, update]) => update.state === 'normal')) {
          normalReads += 1;
          if (normalReads >= 3 && current.state === 'maximized') {
            current = { ...prior, state: 'normal' };
          }
        }
        return { id: 3, ...current };
      });
      mocks.updateWindow.mockImplementation(async (_id, update) => {
        if (update.width !== undefined && current.state === 'normal') current = expected;
      });

      const resize = applyPreparedWindowSize(3, maximized, expected);
      const result = expect(resize).resolves.toEqual(expected);
      await vi.advanceTimersByTimeAsync(2500);
      await result;
      expect(mocks.updateWindow).toHaveBeenNthCalledWith(2, 3, {
        left: expected.left,
        top: expected.top,
        width: expected.width,
        height: expected.height,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('records normalized bounds before applying the requested size', async () => {
    vi.useFakeTimers();
    try {
      const expected = { ...prior, width: 1280, height: 720, state: 'normal' as const };
      const normalized = { ...prior, state: 'normal' as const };
      let current: typeof normalized | typeof expected = normalized;
      mocks.getWindow.mockImplementation(async () => ({ id: 3, ...current }));
      mocks.updateWindow.mockImplementation(async (_id, update) => {
        if (update.width !== undefined) current = expected;
      });
      const onNormalized = vi.fn(async () => {
        expect(mocks.updateWindow).toHaveBeenCalledTimes(1);
      });

      const result = expect(
        applyPreparedWindowSize(3, maximized, expected, onNormalized)
      ).resolves.toEqual(expected);
      await vi.advanceTimersByTimeAsync(1000);
      await result;
      expect(onNormalized).toHaveBeenCalledWith(normalized);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['maximized', 'fullscreen'] as const)(
    'excludes journal persistence from the %s normalization deadline',
    async (state) => {
      vi.useFakeTimers();
      try {
        const expected = { ...prior, width: 1280, height: 720 };
        let current = prior;
        mocks.getWindow.mockImplementation(async () => ({ id: 3, ...current }));
        mocks.updateWindow.mockImplementation(async (_id, update) => {
          if (update.width !== undefined) current = expected;
        });
        const onNormalized = vi.fn(async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 1990));
          expect(mocks.updateWindow).toHaveBeenCalledTimes(1);
          const listener = mocks.subscribeBoundsChanged.mock.calls.at(-1)?.[0];
          listener?.({
            ...current,
            id: 3,
            type: 'normal',
            focused: true,
            alwaysOnTop: false,
            incognito: false,
          });
        });
        const result = expect(
          applyPreparedWindowSize(3, { ...prior, state }, expected, onNormalized)
        ).resolves.toEqual(expected);
        await Promise.all([result, vi.advanceTimersByTimeAsync(3000)]);
        expect(onNormalized).toHaveBeenCalledOnce();
        expect(mocks.updateWindow).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it.each(['maximized', 'fullscreen'] as const)(
    'applies normal state with bounds when the state-only %s update is ignored',
    async (state) => {
      vi.useFakeTimers();
      try {
        const initial = { ...prior, state };
        const expected = { ...prior, width: 1280, height: 720 };
        let current: typeof initial | typeof expected = initial;
        mocks.getWindow.mockImplementation(async () => ({ id: 3, ...current }));
        mocks.updateWindow.mockImplementation(async (_id, update) => {
          if (update.state === 'normal' && update.width === expected.width) current = expected;
          return { id: 3, ...current };
        });
        const onNormalized = vi.fn(async () => undefined);
        const result = expect(
          applyPreparedWindowSize(3, initial, expected, onNormalized)
        ).resolves.toEqual(expected);
        await Promise.all([result, vi.advanceTimersByTimeAsync(5000)]);
        expect(mocks.updateWindow).toHaveBeenNthCalledWith(2, 3, {
          state: 'normal',
          left: expected.left,
          top: expected.top,
          width: expected.width,
          height: expected.height,
        });
        expect(onNormalized).not.toHaveBeenCalled();
        expect(mocks.warn).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it('does not retry normalization after external geometry changes', async () => {
    vi.useFakeTimers();
    try {
      const changed = { ...maximized, left: maximized.left + 100 };
      mocks.getWindow.mockResolvedValue({ id: 3, ...changed, title: 'private title', tabs: [] });
      const result = expect(
        applyPreparedWindowSize(3, maximized, { ...prior, width: 1280 })
      ).rejects.toMatchObject({ message: 'verification-failed' });
      await Promise.all([result, vi.advanceTimersByTimeAsync(2100)]);
      expect(mocks.warn).toHaveBeenCalledExactlyOnceWith('Window verification failed', {
        phase: 'normalization',
        observed: changed,
        quietForMs: 2000,
      });
      expect(mocks.updateWindow).toHaveBeenCalledExactlyOnceWith(3, { state: 'normal' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails after bounded attempts when combined normalization is also ignored', async () => {
    vi.useFakeTimers();
    try {
      mocks.getWindow.mockResolvedValue({ id: 3, ...maximized });
      const expected = { ...prior, width: 1280, height: 720 };
      const result = expect(applyPreparedWindowSize(3, maximized, expected)).rejects.toMatchObject({
        message: 'verification-failed',
        observedSnapshot: maximized,
      });
      await Promise.all([result, vi.advanceTimersByTimeAsync(5000)]);
      expect(mocks.updateWindow).toHaveBeenCalledTimes(3);
      expect(mocks.warn).toHaveBeenCalledExactlyOnceWith('Window verification failed', {
        phase: 'requested-size',
        expected,
        reported: null,
        observed: maximized,
        quietForMs: 2000,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not apply requested bounds when normalized journal persistence fails', async () => {
    mocks.getWindow.mockResolvedValue({ id: 3, ...prior });
    const onNormalized = vi.fn().mockRejectedValue(new Error('journal unavailable'));
    await expect(
      applyPreparedWindowSize(3, maximized, { ...prior, width: 1280 }, onNormalized)
    ).rejects.toMatchObject({ message: 'journal unavailable', observedSnapshot: prior });
    expect(mocks.updateWindow).toHaveBeenCalledExactlyOnceWith(3, { state: 'normal' });
  });

  it('retries a browser bounds update that resolved without changing size', async () => {
    vi.useFakeTimers();
    try {
      const expected = { ...prior, width: 1280, height: 720 };
      let current = prior;
      mocks.getWindow.mockImplementation(async () => ({ id: 3, ...current }));
      mocks.updateWindow.mockImplementation(async () => {
        if (mocks.updateWindow.mock.calls.length === 2) current = expected;
      });

      const result = expect(applyPreparedWindowSize(3, prior, expected)).resolves.toEqual(expected);
      await vi.advanceTimersByTimeAsync(3500);
      await result;
      expect(mocks.updateWindow).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails after one retry when the browser keeps the original bounds', async () => {
    vi.useFakeTimers();
    try {
      mocks.getWindow.mockResolvedValue({ id: 3, ...prior });
      const expected = { ...prior, width: 1280, height: 720 };

      const failure = expect(applyPreparedWindowSize(3, prior, expected)).rejects.toMatchObject({
        message: 'verification-failed',
        observedSnapshot: prior,
      });
      await vi.advanceTimersByTimeAsync(3500);
      await failure;
      expect(mocks.updateWindow).toHaveBeenCalledTimes(2);
      expect(mocks.warn).toHaveBeenCalledExactlyOnceWith('Window verification failed', {
        phase: 'requested-size',
        expected,
        reported: null,
        observed: prior,
        quietForMs: 2000,
      });
    } finally {
      vi.useRealTimers();
    }
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
});

describe('browser window restoration', () => {
  it('waits for normal bounds to settle before restoring maximized state', async () => {
    vi.useFakeTimers();
    try {
      let current: Omit<typeof prior, 'state'> & { state: 'normal' | 'maximized' } = {
        ...prior,
        width: 1280,
        height: 720,
      };
      let resizing = false;
      mocks.getWindow.mockImplementation(async () => ({ id: 3, ...current }));
      mocks.updateWindow.mockImplementation(async (_id, update) => {
        if (update.width !== undefined) {
          resizing = true;
          setTimeout(() => {
            current = { ...prior };
            resizing = false;
          }, 150);
        }
        if (update.state === 'maximized' && !resizing) current = maximized;
        return { id: 3, ...current };
      });
      const result = expect(restoreWindowSnapshot(3, maximized)).resolves.toBeUndefined();
      await Promise.all([result, vi.advanceTimersByTimeAsync(3000)]);
      expect(current.state).toBe('maximized');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not maximize while restoration bounds keep changing', async () => {
    vi.useFakeTimers();
    try {
      let left = prior.left;
      mocks.getWindow.mockImplementation(async () => ({ id: 3, ...prior, left: left++ }));
      const result = expect(restoreWindowSnapshot(3, maximized)).rejects.toThrow(
        'restore-impossible'
      );
      await Promise.all([result, vi.advanceTimersByTimeAsync(2100)]);
      expect(mocks.updateWindow).toHaveBeenCalledTimes(2);
      expect(mocks.updateWindow).not.toHaveBeenCalledWith(3, { state: 'maximized' });
    } finally {
      vi.useRealTimers();
    }
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

  it('accepts Chrome-managed bounds after restoring the maximized state', async () => {
    mocks.getWindow.mockResolvedValue({
      id: 3,
      ...maximized,
      left: maximized.left - 8,
      top: maximized.top - 8,
      width: maximized.width + 16,
      height: maximized.height + 16,
    });

    await expect(restoreWindowSnapshot(3, maximized)).resolves.toBeUndefined();
  });

  it('does not claim a maximized window was restored on another display', async () => {
    vi.useFakeTimers();
    try {
      mocks.getWindow.mockResolvedValue({ id: 3, ...maximized, left: 2000 });
      const failure = expect(restoreWindowSnapshot(3, maximized)).rejects.toThrow(
        'restore-impossible'
      );
      await vi.advanceTimersByTimeAsync(3000);
      await failure;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a large shift even when maximized window bounds still overlap', async () => {
    vi.useFakeTimers();
    try {
      mocks.getWindow.mockResolvedValue({ id: 3, ...maximized, left: maximized.left + 400 });
      const failure = expect(restoreWindowSnapshot(3, maximized)).rejects.toThrow(
        'restore-impossible'
      );
      await vi.advanceTimersByTimeAsync(3000);
      await failure;
    } finally {
      vi.useRealTimers();
    }
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
