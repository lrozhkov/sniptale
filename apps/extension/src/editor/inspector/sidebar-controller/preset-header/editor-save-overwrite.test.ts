import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  addEditorPreset: vi.fn(async () => undefined),
  updateEditorPreset: vi.fn(async () => undefined),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../composition/persistence/editor-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/editor-presets')>()),
  ...storageMocks,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
  },
}));

import { buildStoredPresetSavePanel } from './editor-save';

function createSaveDraft(overrides: Record<string, unknown> = {}) {
  return {
    closeSavePanel: vi.fn(),
    openSavePanel: vi.fn(),
    overwriteTargetId: '',
    saveMode: 'create' as const,
    saveName: 'Preset',
    savePanelOpen: true,
    setOverwriteTargetId: vi.fn(),
    setSaveMode: vi.fn(),
    setSaveName: vi.fn(),
    ...overrides,
  };
}

function createArrowSettings(width: number) {
  return {
    color: '#111111',
    width,
    opacity: 0.7,
    shadow: 20,
    mode: 'straight' as const,
    startHead: 'none' as const,
    endHead: 'triangle' as const,
    variant: 'standard' as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.addEditorPreset.mockResolvedValue(undefined);
  storageMocks.updateEditorPreset.mockResolvedValue(undefined);
});

describe('buildStoredPresetSavePanel overwrite targets', () => {
  it('excludes system presets and defaults to the first custom target', () => {
    const setOverwriteTargetId = vi.fn();
    const panel = buildStoredPresetSavePanel({
      collection: {
        defaultPresetId: 'system',
        presets: [
          {
            id: 'system',
            name: 'System',
            order: 0,
            enabled: true,
            isSystemDefault: true,
            settings: createArrowSettings(4),
          },
          {
            id: 'custom',
            name: 'Custom',
            order: 1,
            enabled: true,
            settings: createArrowSettings(5),
          },
        ],
      },
      currentSettings: createArrowSettings(7),
      family: 'arrow',
      markClean: vi.fn(),
      saveDraft: createSaveDraft({ setOverwriteTargetId }),
      setSelectedPresetId: vi.fn(),
    });

    panel.onModeChange('overwrite');

    expect(panel.overwriteOptions.map((option) => option.value)).toEqual(['custom']);
    expect(panel.overwriteTargetId).toBe('custom');
    expect(setOverwriteTargetId).toHaveBeenCalledWith('custom');
  });
});

describe('buildStoredPresetSavePanel overwrite failures', () => {
  it('keeps overwrite dirty when persistence fails', async () => {
    const markClean = vi.fn();
    const closeSavePanel = vi.fn();
    storageMocks.updateEditorPreset.mockRejectedValueOnce(new Error('failed'));

    const panel = buildStoredPresetSavePanel({
      collection: {
        defaultPresetId: 'preset-1',
        presets: [
          {
            id: 'preset-1',
            name: 'Preset 1',
            order: 0,
            enabled: true,
            settings: createArrowSettings(4),
          },
        ],
      },
      currentSettings: createArrowSettings(9),
      family: 'arrow',
      markClean,
      saveDraft: createSaveDraft({
        closeSavePanel,
        overwriteTargetId: 'preset-1',
        saveMode: 'overwrite',
        saveName: 'Preset 1',
      }),
      setSelectedPresetId: vi.fn(),
    });

    panel.onSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(markClean).not.toHaveBeenCalled();
    expect(closeSavePanel).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
  });
});
