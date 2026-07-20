import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings, ViewportPreset } from '../../../../contracts/settings';

const {
  attachDebuggerSafeMock,
  clearViewportMock,
  detachDebuggerMock,
  resetZoomMock,
  setViewportMock,
} = vi.hoisted(() => ({
  attachDebuggerSafeMock: vi.fn(),
  clearViewportMock: vi.fn(),
  detachDebuggerMock: vi.fn(),
  resetZoomMock: vi.fn(),
  setViewportMock: vi.fn(),
}));

vi.mock('../../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../debugger/session/attach')>()),
  attachDebuggerSafe: attachDebuggerSafeMock,
}));

vi.mock('../../../debugger/session/detach', () => ({
  detachDebugger: detachDebuggerMock,
}));

vi.mock('../../../debugger/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../debugger/workspace')>()),
  clearViewport: clearViewportMock,
  resetZoom: resetZoomMock,
  setViewport: setViewportMock,
}));

import { isDebuggerRequired, setupQuickActionDebugger } from './debugger';

function createQuickActionSettings(presets: ViewportPreset[]): Settings {
  return {
    captureAction: 'download_default' as const,
    contextMenu: {
      enabled: true,
      showScreenshots: true,
      showVideo: true,
      showExport: true,
      showImageEditor: true,
      showVideoEditor: true,
      showGallery: true,
      showPageLinkCopy: true,
      showSettings: true,
    },
    saveCapturesToGallery: false,
    defaultViewportId: 'native',
    imageFormat: 'png',
    imageQuality: 90,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    viewportPresets: presets,
  };
}

function createViewportState() {
  return new Map<number, { width: number; height: number } | null>();
}

beforeEach(() => {
  vi.clearAllMocks();
  attachDebuggerSafeMock.mockResolvedValue(true);
  clearViewportMock.mockResolvedValue(undefined);
  detachDebuggerMock.mockResolvedValue(undefined);
  resetZoomMock.mockResolvedValue(undefined);
  setViewportMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isDebuggerRequired', () => {
  it('recognizes non-native emulation values', () => {
    expect(isDebuggerRequired('preset-1')).toBe(true);
    expect(isDebuggerRequired('native')).toBe(false);
  });
});

function runSetupQuickActionDebuggerSuccessSuite() {
  it('configures viewport emulation before capture', async () => {
    vi.useFakeTimers();
    const viewportState = createViewportState();
    const promise = setupQuickActionDebugger(
      21,
      'preset-1',
      createQuickActionSettings([{ id: 'preset-1', width: 1440, height: 900, label: 'Preset 1' }]),
      viewportState
    );

    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(attachDebuggerSafeMock).toHaveBeenCalledWith(
      21,
      'screenshot',
      expect.objectContaining({ token: expect.any(String) })
    );
    expect(setViewportMock).toHaveBeenCalledWith(21, 1440, 900);
    expect(resetZoomMock).toHaveBeenCalledWith(21);
    expect(viewportState.get(21)).toEqual({ width: 1440, height: 900 });
  });

  it('returns true when no preset exists for the emulation', async () => {
    await expect(
      setupQuickActionDebugger(
        21,
        'preset-missing',
        createQuickActionSettings([
          { id: 'preset-1', width: 1440, height: 900, label: 'Preset 1' },
        ]),
        createViewportState()
      )
    ).resolves.toMatchObject({ ready: true });
  });
}

function runSetupQuickActionDebuggerFailureSuite() {
  it('returns false when debugger attachment fails', async () => {
    attachDebuggerSafeMock.mockResolvedValue(false);

    await expect(
      setupQuickActionDebugger(
        21,
        'preset-1',
        createQuickActionSettings([
          { id: 'preset-1', width: 1440, height: 900, label: 'Preset 1' },
        ]),
        createViewportState()
      )
    ).resolves.toEqual({ ready: false });
  });

  it('rolls back debugger ownership when viewport preparation fails', async () => {
    const viewportState = createViewportState();
    setViewportMock.mockRejectedValueOnce(new Error('viewport failed'));

    await expect(
      setupQuickActionDebugger(
        21,
        'preset-1',
        createQuickActionSettings([
          { id: 'preset-1', width: 1440, height: 900, label: 'Preset 1' },
        ]),
        viewportState
      )
    ).rejects.toThrow('viewport failed');

    expect(clearViewportMock).toHaveBeenCalledWith(21);
    expect(detachDebuggerMock).toHaveBeenCalledWith(21, 'screenshot');
    expect(viewportState.has(21)).toBe(false);
  });
}

describe('setupQuickActionDebugger', () => {
  runSetupQuickActionDebuggerSuccessSuite();
  runSetupQuickActionDebuggerFailureSuite();
});
