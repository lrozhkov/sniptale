// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Settings, SavePreset } from '../../../../contracts/settings';
import { useSavePresetsSection } from './controller';

const { toastErrorMock, toastSuccessMock, useSettingsStoreMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  useSettingsStoreMock: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock('../../../runtime/store/useSettingsStore', async (importOriginal) => ({
  ...(await importOriginal()),
  useSettingsStore: useSettingsStoreMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useSavePresetsSection> | null = null;

function createPreset(id: string): SavePreset {
  return {
    enabled: true,
    id,
    name: `Preset ${id}`,
    order: 0,
    path: `Folder/${id}`,
  };
}

function createSettings(): Settings {
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
    defaultExportPresetId: 'used',
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    imageFormat: 'png',
    imageQuality: 100,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    presets: [createPreset('used'), createPreset('unused')],
    saveCapturesToGallery: false,
  };
}

function SavePresetsSectionHarness() {
  latestState = useSavePresetsSection();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  useSettingsStoreMock.mockReturnValue({
    isLoading: false,
    settings: createSettings(),
    updateSettings: vi.fn(async () => undefined),
  });

  await act(async () => {
    root?.render(<SavePresetsSectionHarness />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Expected save presets section state');
  }

  return latestState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
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

describe('useSavePresetsSection', () => {
  it('opens delete confirmation only for presets that are not used as defaults', async () => {
    await renderHarness();
    const unusedPreset = getState().presets.find((preset) => preset.id === 'unused');
    if (!unusedPreset) {
      throw new Error('Expected unused preset');
    }

    act(() => {
      getState().handleDeletePreset(unusedPreset);
    });

    expect(getState().confirmDelete).toEqual(unusedPreset);
  });

  it('keeps confirmation closed and reports an error when deleting a preset that is still in use', async () => {
    await renderHarness();
    const usedPreset = getState().presets.find((preset) => preset.id === 'used');
    if (!usedPreset) {
      throw new Error('Expected used preset');
    }

    act(() => {
      getState().handleDeletePreset(usedPreset);
    });

    expect(getState().confirmDelete).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith('savePresets.messages.presetInUseError');
  });

  it('exposes the save and toggle handlers from the owner controller surface', async () => {
    await renderHarness();

    expect(typeof getState().handleSavePreset).toBe('function');
    expect(typeof getState().handleTogglePresetEnabled).toBe('function');
    expect(typeof getState().handleToggleSaveToGallery).toBe('function');
    expect(typeof getState().handleCaptureActionChange).toBe('function');
  });
});
