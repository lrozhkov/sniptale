// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Settings, SavePreset } from '../../../../contracts/settings';
import { useSavePresetsSync } from './sync';

const { useSettingsStoreMock } = vi.hoisted(() => ({
  useSettingsStoreMock: vi.fn(),
}));

vi.mock('../../../runtime/store/useSettingsStore', async (importOriginal) => ({
  ...(await importOriginal()),
  useSettingsStore: useSettingsStoreMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useSavePresetsSync> | null = null;

function createPreset(id: string): SavePreset {
  return {
    enabled: true,
    id,
    name: `Preset ${id}`,
    order: 0,
    path: `Folder/${id}`,
  };
}

function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    captureAction: 'download_default',
    contextMenu: {
      enabled: true,
      showExport: true,
      showGallery: true,
      showPageLinkCopy: true,
      showImageEditor: true,
      showScreenshots: true,
      showSettings: true,
      showVideo: true,
      showVideoEditor: true,
    },
    defaultExportPresetId: 'preset-export',
    defaultImagePresetId: 'preset-image',
    defaultVideoPresetId: 'preset-video',
    imageFormat: 'png',
    imageQuality: 100,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    presets: [createPreset('preset-image')],
    saveCapturesToGallery: true,
    ...overrides,
  };
}

function SavePresetsSyncHarness() {
  latestState = useSavePresetsSync();
  return null;
}

async function renderHarness(settings: Settings) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  useSettingsStoreMock.mockReturnValue({
    isLoading: false,
    settings,
    updateSettings: vi.fn(async () => undefined),
  });

  await act(async () => {
    root?.render(<SavePresetsSyncHarness />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Expected save presets sync state');
  }

  return latestState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useSettingsStoreMock.mockReset();
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

describe('useSavePresetsSync', () => {
  it('mirrors persisted save-preset settings into local controller state', async () => {
    await renderHarness(createSettings());

    expect(getState().captureAction).toBe('download_default');
    expect(getState().defaultExportPresetId).toBe('preset-export');
    expect(getState().defaultImagePresetId).toBe('preset-image');
    expect(getState().defaultVideoPresetId).toBe('preset-video');
    expect(getState().saveCapturesToGallery).toBe(true);
    expect(getState().presets).toHaveLength(1);
  });

  it('falls back to empty and null values when persisted settings omit preset-specific fields', async () => {
    const settings = createSettings();
    delete (settings as Partial<Settings>).captureAction;
    delete (settings as Partial<Settings>).defaultExportPresetId;
    delete (settings as Partial<Settings>).defaultImagePresetId;
    delete (settings as Partial<Settings>).defaultVideoPresetId;
    delete (settings as Partial<Settings>).presets;
    delete (settings as Partial<Settings>).saveCapturesToGallery;

    await renderHarness(settings);

    expect(getState().captureAction).toBe('download_default');
    expect(getState().defaultExportPresetId).toBeNull();
    expect(getState().defaultImagePresetId).toBeNull();
    expect(getState().defaultVideoPresetId).toBeNull();
    expect(getState().saveCapturesToGallery).toBe(false);
    expect(getState().presets).toEqual([]);
  });
});
