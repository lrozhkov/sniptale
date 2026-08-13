import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  applyPreparedWindowSizeMock,
  loadSettingsMock,
  prepareWindowSizeMock,
  restoreWindowSnapshotMock,
} = vi.hoisted(() => ({
  applyPreparedWindowSizeMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  prepareWindowSizeMock: vi.fn(),
  restoreWindowSnapshotMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../capture-surface/window', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface/window')>()),
  applyPreparedWindowSize: applyPreparedWindowSizeMock,
  prepareWindowSize: prepareWindowSizeMock,
  restoreWindowSnapshot: restoreWindowSnapshotMock,
}));

import { resizeBrowserWindowFromContextMenu } from './window-resize';

const prior = {
  type: 'window' as const,
  height: 900,
  left: 20,
  state: 'normal' as const,
  top: 30,
  width: 1440,
};
const expected = { ...prior, height: 720, width: 1280 };

function settingsWithPreset(overrides: Record<string, unknown> = {}) {
  return {
    viewportPresets: [
      {
        enabled: true,
        height: 720,
        id: 'window-hd',
        kind: 'user',
        name: 'Window HD',
        order: 0,
        target: 'window',
        width: 1280,
        ...overrides,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSettingsMock.mockResolvedValue(settingsWithPreset());
  prepareWindowSizeMock.mockResolvedValue({ expected, prior });
  applyPreparedWindowSizeMock.mockResolvedValue(expected);
  restoreWindowSnapshotMock.mockResolvedValue(undefined);
});

describe('context menu browser-window resizing', () => {
  it('resolves an enabled window preset from current settings and applies its exact size', async () => {
    await resizeBrowserWindowFromContextMenu(9, 'window-hd');

    expect(prepareWindowSizeMock).toHaveBeenCalledWith(9, 1280, 720);
    expect(applyPreparedWindowSizeMock).toHaveBeenCalledWith(9, prior, expected);
    expect(restoreWindowSnapshotMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', settingsWithPreset({ id: 'another' })],
    ['disabled', settingsWithPreset({ enabled: false })],
    ['unsupported-context', settingsWithPreset({ target: 'viewport' })],
  ])('rejects %s presets before mutating the browser window', async (reason, settings) => {
    loadSettingsMock.mockResolvedValue(settings);

    await expect(resizeBrowserWindowFromContextMenu(9, 'window-hd')).rejects.toMatchObject({
      code: reason,
    });
    expect(prepareWindowSizeMock).not.toHaveBeenCalled();
    expect(applyPreparedWindowSizeMock).not.toHaveBeenCalled();
  });

  it('restores the exact previous window snapshot when applying the new size fails', async () => {
    const mutationError = new Error('resize rejected');
    applyPreparedWindowSizeMock.mockRejectedValueOnce(mutationError);

    await expect(resizeBrowserWindowFromContextMenu(9, 'window-hd')).rejects.toMatchObject({
      code: 'platform-rejected',
      message: mutationError.message,
    });
    expect(restoreWindowSnapshotMock).toHaveBeenCalledWith(9, prior);
  });

  it.each([
    ['window-too-large', 'window-too-large'],
    ['verification-failed', 'verification-failed after browser update'],
    ['platform-rejected', 'display metadata unavailable'],
  ])('normalizes preparation failures to %s', async (code, message) => {
    prepareWindowSizeMock.mockRejectedValueOnce(new Error(message));

    await expect(resizeBrowserWindowFromContextMenu(9, 'window-hd')).rejects.toMatchObject({
      code,
    });
    expect(applyPreparedWindowSizeMock).not.toHaveBeenCalled();
    expect(restoreWindowSnapshotMock).not.toHaveBeenCalled();
  });

  it('surfaces a typed restore failure when resize rollback also fails', async () => {
    applyPreparedWindowSizeMock.mockRejectedValueOnce(new Error('resize rejected'));
    restoreWindowSnapshotMock.mockRejectedValueOnce(new Error('restore rejected'));

    await expect(resizeBrowserWindowFromContextMenu(9, 'window-hd')).rejects.toMatchObject({
      code: 'restore-impossible',
    });
  });

  it('serializes repeated resize actions for the same browser window', async () => {
    let releaseFirstResize: (() => void) | undefined;
    applyPreparedWindowSizeMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstResize = resolve;
        })
    );

    const firstResize = resizeBrowserWindowFromContextMenu(9, 'window-hd');
    const secondResize = resizeBrowserWindowFromContextMenu(9, 'window-hd');
    await vi.waitFor(() => expect(applyPreparedWindowSizeMock).toHaveBeenCalledTimes(1));

    releaseFirstResize?.();
    await Promise.all([firstResize, secondResize]);

    expect(applyPreparedWindowSizeMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an unavailable browser window id before reading settings', async () => {
    await expect(resizeBrowserWindowFromContextMenu(-1, 'window-hd')).rejects.toMatchObject({
      code: 'platform-rejected',
      message: 'Active browser window is unavailable',
    });
    expect(loadSettingsMock).not.toHaveBeenCalled();
  });
});
