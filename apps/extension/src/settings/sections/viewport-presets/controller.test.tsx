// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings, ViewportPreset } from '../../../contracts/settings';
import { useViewportPresetsSection } from './controller';

const { toastSuccessMock, useSettingsStoreMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  useSettingsStoreMock: vi.fn(),
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    success: toastSuccessMock,
  },
}));
vi.mock('../../runtime/store/useSettingsStore', async (importOriginal) => ({
  ...(await importOriginal()),
  useSettingsStore: useSettingsStoreMock,
}));

let container: HTMLDivElement | null = null;
let latestState: ReturnType<typeof useViewportPresetsSection> | null = null;
let root: Root | null = null;
function createViewportPreset(overrides: Partial<ViewportPreset> = {}): ViewportPreset {
  return {
    id: overrides.id ?? 'preset-1',
    label: overrides.label ?? 'Desktop',
    width: overrides.width ?? 1440,
    height: overrides.height ?? 900,
  };
}
function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    captureAction: 'download_default',
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
    viewportPresets: [createViewportPreset()],
    defaultViewportId: 'preset-1',
    presets: [],
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultExportPresetId: null,
    imageFormat: 'png',
    imageQuality: 100,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    ...overrides,
  };
}

function createSettingsStore(settings: Settings) {
  const store = {
    error: null,
    isLoading: false,
    settings,
    clearSettings: vi.fn(async () => undefined),
    loadSettings: vi.fn(async () => undefined),
    updateSettings: vi.fn(async (nextSettings: Partial<Settings>) => {
      store.settings = { ...store.settings, ...nextSettings };
    }),
  };
  return store;
}

function ViewportPresetsHarness() {
  latestState = useViewportPresetsSection();
  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderHarness(settings: Settings = createSettings()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const store = createSettingsStore(settings);
  useSettingsStoreMock.mockReturnValue(store);

  await act(async () => {
    root?.render(<ViewportPresetsHarness />);
  });
  await flushEffects();
  return store;
}

function getState() {
  if (!latestState) {
    throw new Error('Viewport preset state is not ready');
  }
  return latestState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
  toastSuccessMock.mockReset();
  useSettingsStoreMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function verifyViewportPresetCreationFlow() {
  const store = await renderHarness();
  expect(getState().presetsCountLabel).toBe('viewportPresets.section.countOne');
  expect(getState().defaultViewportId).toBe('preset-1');
  act(() => {
    getState().handleAddViewportPreset();
  });
  expect(getState().editingViewport).toBeUndefined();
  expect(getState().isViewportEditorOpen).toBe(true);
  await act(async () => {
    await getState().handleSaveViewportPreset('Tablet', 1280, 720);
  });
  expect(getState().viewportPresets).toEqual([
    createViewportPreset(),
    {
      id: '11111111-1111-4111-8111-111111111111',
      label: 'Tablet',
      width: 1280,
      height: 720,
    },
  ]);
  expect(store.updateSettings).toHaveBeenCalledWith({
    viewportPresets: expect.arrayContaining([
      expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }),
    ]),
  });
  expect(getState().isViewportEditorOpen).toBe(false);
  expect(toastSuccessMock).toHaveBeenCalledWith('viewportPresets.messages.presetCreated');
  await act(async () => {
    await getState().handleDefaultViewportChange('11111111-1111-4111-8111-111111111111');
  });
  expect(getState().defaultViewportId).toBe('11111111-1111-4111-8111-111111111111');
  expect(store.updateSettings).toHaveBeenLastCalledWith({
    defaultViewportId: '11111111-1111-4111-8111-111111111111',
  });
  expect(toastSuccessMock).toHaveBeenLastCalledWith('viewportPresets.messages.defaultUpdated');
}

async function verifyViewportPresetEditDeleteFlow() {
  const presetA = createViewportPreset({ id: 'preset-a', label: 'Desktop' });
  const presetB = createViewportPreset({
    id: 'preset-b',
    label: 'Phone',
    width: 390,
    height: 844,
  });
  const store = await renderHarness(
    createSettings({
      viewportPresets: [presetA, presetB],
      defaultViewportId: 'preset-b',
    })
  );
  await verifyViewportPresetEditFlow(presetA, presetB);
  await verifyViewportPresetDeleteFlow(store);
}

async function verifyViewportPresetEditFlow(presetA: ViewportPreset, presetB: ViewportPreset) {
  act(() => {
    getState().handleEditViewportPreset(presetA);
  });

  expect(getState().editingViewport).toEqual(presetA);
  expect(getState().isViewportEditorOpen).toBe(true);

  await act(async () => {
    await getState().handleSaveViewportPreset('Desktop XL', 1600, 1000);
  });

  expect(getState().viewportPresets).toEqual([
    {
      id: 'preset-a',
      label: 'Desktop XL',
      width: 1600,
      height: 1000,
    },
    presetB,
  ]);
  expect(toastSuccessMock).toHaveBeenCalledWith('viewportPresets.messages.presetUpdated');
}

async function verifyViewportPresetDeleteFlow(store: ReturnType<typeof createSettingsStore>) {
  act(() => {
    getState().handleDeleteViewportPreset(
      createViewportPreset({
        id: 'preset-b',
        label: 'Phone',
        width: 390,
        height: 844,
      })
    );
  });

  expect(getState().viewportConfirmOpen).toBe(true);
  expect(getState().deleteMessage).toContain('"Phone"');

  await act(async () => {
    await getState().confirmDeleteViewport();
  });

  expect(getState().viewportPresets).toEqual([
    {
      id: 'preset-a',
      label: 'Desktop XL',
      width: 1600,
      height: 1000,
    },
  ]);
  expect(store.updateSettings).toHaveBeenLastCalledWith({
    defaultViewportId: 'native',
    viewportPresets: [
      {
        id: 'preset-a',
        label: 'Desktop XL',
        width: 1600,
        height: 1000,
      },
    ],
  });
  expect(getState().viewportConfirmOpen).toBe(false);
  expect(toastSuccessMock).toHaveBeenLastCalledWith('viewportPresets.messages.presetDeleted');
}

describe('useViewportPresetsSection creation flow', () => {
  it(
    'opens the editor, creates a preset, and updates the default viewport id',
    verifyViewportPresetCreationFlow
  );
});

describe('useViewportPresetsSection edit and delete flow', () => {
  it(
    'edits a preset, exposes delete copy, and removes the selected preset on confirm',
    verifyViewportPresetEditDeleteFlow
  );
});

describe('useViewportPresetsSection dialog helpers', () => {
  it('closes dialogs and ignores delete confirmation without a selected preset', async () => {
    await renderHarness();

    act(() => {
      getState().handleAddViewportPreset();
      getState().handleDeleteViewportPreset(createViewportPreset());
    });

    expect(getState().isViewportEditorOpen).toBe(true);
    expect(getState().viewportConfirmOpen).toBe(true);

    act(() => {
      getState().closeViewportEditor();
      getState().closeViewportDeleteDialog();
    });

    expect(getState().isViewportEditorOpen).toBe(false);
    expect(getState().viewportConfirmOpen).toBe(false);

    await act(async () => {
      await getState().confirmDeleteViewport();
    });

    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
