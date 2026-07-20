// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadSettingsMock, loggerErrorMock } = vi.hoisted(() => ({
  loadSettingsMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

import { useSaveDialogPresets } from './presets';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useSaveDialogPresets> | null = null;

function Harness() {
  latestState = useSaveDialogPresets();
  return null;
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
    await flushEffects();
  });
}

describe('useSaveDialogPresets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    latestState = null;
    vi.unstubAllGlobals();
  });

  it('keeps only enabled presets after a successful settings load', async () => {
    loadSettingsMock.mockResolvedValue({
      presets: [
        { enabled: true, id: 'preset-1', name: 'Enabled', path: 'Downloads' },
        { enabled: false, id: 'preset-2', name: 'Disabled', path: 'Archive' },
      ],
    });

    await renderHarness();

    expect(latestState).toEqual({
      loadError: false,
      loading: false,
      presets: [{ enabled: true, id: 'preset-1', name: 'Enabled', path: 'Downloads' }],
    });
  });

  it('surfaces preset-load failures as an explicit error state', async () => {
    const error = new Error('load failed');
    loadSettingsMock.mockRejectedValue(error);

    await renderHarness();

    expect(latestState).toEqual({
      loadError: true,
      loading: false,
      presets: [],
    });
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to load save dialog presets', error);
  });
});
