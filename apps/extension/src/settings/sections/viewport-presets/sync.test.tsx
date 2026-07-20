// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Settings } from '../../../contracts/settings';
import { useViewportPresetsSync } from './sync';

const { useSettingsStoreMock } = vi.hoisted(() => ({
  useSettingsStoreMock: vi.fn(),
}));

vi.mock('../../runtime/store/useSettingsStore', async (importOriginal) => ({
  ...(await importOriginal()),
  useSettingsStore: useSettingsStoreMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useViewportPresetsSync> | null = null;

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
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultViewportId: 'viewport-1',
    imageFormat: 'png',
    imageQuality: 100,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    presets: [],
    saveCapturesToGallery: false,
    viewportPresets: [{ height: 768, id: 'viewport-1', label: 'Desktop', width: 1366 }],
    ...overrides,
  };
}

function ViewportSyncHarness() {
  latestState = useViewportPresetsSync();
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
    root?.render(<ViewportSyncHarness />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Expected viewport sync state');
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

describe('useViewportPresetsSync', () => {
  it('mirrors viewport settings and falls back to native when the default id is missing', async () => {
    const settings = createSettings();
    delete (settings as Partial<Settings>).defaultViewportId;
    delete (settings as Partial<Settings>).viewportPresets;

    await renderHarness(settings);

    expect(getState().defaultViewportId).toBe('native');
    expect(getState().viewportPresets).toEqual([]);
  });
});
