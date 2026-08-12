import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavePreset, Settings, SettingsPatch } from '../../../../../contracts/settings';
import { buildSavePresetsViewModel, createSavePresetsActions, createSettingsPersister } from '.';
const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
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
function createPreset(id: string, order: number, overrides: Partial<SavePreset> = {}): SavePreset {
  return {
    id,
    name: `Preset ${id}`,
    path: `Folder/${id}`,
    enabled: true,
    order,
    ...overrides,
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
    viewportPresets: [],
    defaultViewportPresetId: null,
    presets: [createPreset('a', 0), createPreset('b', 1)],
    defaultImagePresetId: 'a',
    defaultVideoPresetId: null,
    defaultExportPresetId: 'b',
    imageFormat: 'png',
    imageQuality: 100,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    ...overrides,
  };
}
function createSyncState(settings: Settings) {
  const sync = {
    captureAction: settings.captureAction,
    defaultExportPresetId: settings.defaultExportPresetId ?? null,
    defaultImagePresetId: settings.defaultImagePresetId ?? null,
    defaultVideoPresetId: settings.defaultVideoPresetId ?? null,
    isLoading: false,
    presets: [...(settings.presets ?? [])],
    settings,
    updateSettings: vi.fn(async (_value: SettingsPatch) => undefined),
    setCaptureAction: vi.fn((value) => {
      sync.captureAction = value;
    }),
    setDefaultExportPresetId: vi.fn((value) => {
      sync.defaultExportPresetId =
        typeof value === 'function' ? value(sync.defaultExportPresetId) : value;
    }),
    setDefaultImagePresetId: vi.fn((value) => {
      sync.defaultImagePresetId =
        typeof value === 'function' ? value(sync.defaultImagePresetId) : value;
    }),
    setDefaultVideoPresetId: vi.fn((value) => {
      sync.defaultVideoPresetId =
        typeof value === 'function' ? value(sync.defaultVideoPresetId) : value;
    }),
    setPresets: vi.fn((value) => {
      sync.presets = value;
    }),
  };
  return sync;
}
function createHarness(overrides?: {
  presets?: SavePreset[];
  confirmDelete?: SavePreset | null;
  editingPreset?: SavePreset;
}) {
  const settings = createSettings({
    presets: overrides?.presets ?? [createPreset('a', 0), createPreset('b', 1)],
  });
  const sync = createSyncState(settings);
  const dialogState = {
    closeDeleteDialog: vi.fn(),
    closeEditor: vi.fn(),
    confirmDelete: overrides?.confirmDelete ?? null,
    ...(overrides?.editingPreset === undefined ? {} : { editingPreset: overrides.editingPreset }),
  };
  return {
    sync,
    dialogState,
    actions: createSavePresetsActions(sync, dialogState),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
});

describe('save presets section view model and persister', () => {
  it('builds translated options and persists partial settings without stale snapshot merges', async () => {
    const { sync } = createHarness();
    const model = buildSavePresetsViewModel(sync);
    const persist = createSettingsPersister(sync);

    expect(model.captureActionOptions.map((option) => option.value)).toEqual([
      'download_default',
      'ask_preset',
      'ask_system',
      'edit',
      'copy',
      'save_to_library',
    ]);
    expect(model.presetOptions).toEqual([
      { value: '', label: 'savePresets.section.unsetOption' },
      { value: 'a', label: 'Preset a' },
      { value: 'b', label: 'Preset b' },
    ]);

    await persist({ captureAction: 'copy' });

    expect(sync.updateSettings).toHaveBeenCalledWith({
      captureAction: 'copy',
    });
  });
});

describe('save presets section delete action', () => {
  it('deletes presets, clears default ids, persists state, and closes the dialog', async () => {
    const { sync, dialogState, actions } = createHarness({
      confirmDelete: createPreset('a', 0),
    });

    await actions.confirmDeletePreset();

    expect(sync.presets).toEqual([createPreset('b', 0)]);
    expect(sync.defaultImagePresetId).toBeNull();
    expect(sync.defaultExportPresetId).toBe('b');
    expect(sync.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        presets: [createPreset('b', 0)],
        defaultImagePresetId: null,
      })
    );
    expect(dialogState.closeDeleteDialog).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});

describe('save presets section change and reorder actions', () => {
  it('changes capture action and default preset ids through the shared persister', async () => {
    const { sync, actions } = createHarness();

    await actions.handleCaptureActionChange('copy');
    await actions.handleDefaultPresetChange(
      'defaultVideoPresetId',
      'a',
      sync.setDefaultVideoPresetId,
      sync.defaultVideoPresetId
    );
    await actions.handleDefaultPresetChange(
      'defaultExportPresetId',
      '',
      sync.setDefaultExportPresetId,
      sync.defaultExportPresetId
    );

    expect(sync.captureAction).toBe('copy');
    expect(sync.defaultVideoPresetId).toBe('a');
    expect(sync.defaultExportPresetId).toBeNull();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('reorders presets through the canonical insertion intent', async () => {
    const { sync, actions } = createHarness();

    await actions.handleMoveBefore('a', null);

    expect(sync.presets.map((preset) => ({ id: preset.id, order: preset.order }))).toEqual([
      { id: 'b', order: 0 },
      { id: 'a', order: 1 },
    ]);
    expect(sync.updateSettings).toHaveBeenCalledTimes(1);
  });

  it('rolls compact controls back when persistence fails', async () => {
    const { sync, actions } = createHarness();
    sync.updateSettings.mockRejectedValue(new Error('write failed'));

    await expect(actions.handleCaptureActionChange('copy')).rejects.toThrow('write failed');
    expect(sync.captureAction).toBe('download_default');

    await expect(
      actions.handleDefaultPresetChange(
        'defaultVideoPresetId',
        'a',
        sync.setDefaultVideoPresetId,
        sync.defaultVideoPresetId
      )
    ).rejects.toThrow('write failed');
    expect(sync.defaultVideoPresetId).toBeNull();
  });
});

describe('save presets section validation actions', () => {
  it('guards deleting a preset that is currently in use', () => {
    const { actions } = createHarness();

    actions.handleDeletePreset(createPreset('a', 0));
    actions.handleDeletePreset(createPreset('unused', 3));

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('savePresets.messages.presetInUseError');
  });

  it('creates a preset with sanitized path and validates blank names', async () => {
    const { sync, dialogState, actions } = createHarness();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '11111111-1111-1111-1111-111111111111'
    );
    await actions.handleSavePreset('  New preset  ', '../Shots?:/nested//', true);

    expect(sync.presets.at(-1)).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      enabled: true,
      name: 'New preset',
      order: 2,
      path: 'Shots--/nested',
    });
    expect(dialogState.closeEditor).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).not.toHaveBeenCalled();

    const callCount = sync.updateSettings.mock.calls.length;
    await actions.handleSavePreset('   ', 'ignored', true);

    expect(sync.updateSettings).toHaveBeenCalledTimes(callCount);
    expect(toastErrorMock).toHaveBeenCalledWith('savePresets.messages.nameRequired');
  });
});

describe('save presets section edit validation actions', () => {
  it('updates an existing preset and keeps its previous path when sanitized input is empty', async () => {
    const editingPreset = createPreset('a', 0, { path: 'Existing' });
    const { sync, dialogState, actions } = createHarness({
      editingPreset,
      presets: [editingPreset, createPreset('b', 1)],
    });

    await actions.handleSavePreset(' Renamed ', '../', false);

    expect(sync.presets[0]).toEqual({
      ...editingPreset,
      enabled: false,
      name: 'Renamed',
      path: 'Existing',
    });
    expect(dialogState.closeEditor).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});

describe('save presets section toggle actions', () => {
  it('toggles preset visibility without redundant success toasts', async () => {
    const { sync, actions } = createHarness();
    await actions.handleTogglePresetEnabled(sync.presets[0]!);
    await actions.handleTogglePresetEnabled(sync.presets[0]!);

    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
