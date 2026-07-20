/* eslint-disable max-lines-per-function --
   border preset save proof keeps create/overwrite flows together */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  addBorderPreset: vi.fn(async () => undefined),
  updateBorderPreset: vi.fn(async () => undefined),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/highlighter')>()),
  ...storageMocks,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('../border-preset', () => ({
  createBorderPresetFromShapeSettings: vi.fn((settings: { strokeColor: string }) => ({
    id: 'generated',
    name: 'Generated',
    order: 9,
    enabled: true,
    width: 4,
    color: settings.strokeColor,
    style: 'solid',
    radius: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    shadow: 10,
    opacity: 100,
    strokeOpacity: 100,
    fillColor: '#ffffff',
    fillOpacity: 30,
    inheritCustomCss: false,
    customCss: '',
  })),
}));

import { buildBorderPresetSavePanel } from './border-save';

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.addBorderPreset.mockResolvedValue(undefined);
  storageMocks.updateBorderPreset.mockResolvedValue(undefined);
});

describe('buildBorderPresetSavePanel', () => {
  it('overwrites the selected border preset while preserving identity fields', async () => {
    const closeSavePanel = vi.fn();
    const markClean = vi.fn();
    const setSaveMode = vi.fn();
    const panel = buildBorderPresetSavePanel({
      borderPresets: [
        {
          id: 'border-1',
          name: 'Preset',
          order: 3,
          enabled: true,
          width: 2,
          color: '#000000',
          style: 'solid',
          radius: 0,
          padding: { top: 2, right: 2, bottom: 2, left: 2 },
          shadow: 0,
          opacity: 100,
          strokeOpacity: 100,
          fillColor: '#ffffff',
          fillOpacity: 0,
          inheritCustomCss: false,
          customCss: '',
        },
        {
          id: 'system',
          name: 'System',
          order: 0,
          enabled: true,
          isSystemDefault: true,
          width: 2,
          color: '#000000',
          style: 'solid',
          radius: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          shadow: 0,
          opacity: 100,
          strokeOpacity: 100,
          fillColor: '#ffffff',
          fillOpacity: 0,
          inheritCustomCss: false,
          customCss: '',
        },
      ],
      currentSettings: { strokeColor: '#123456' } as never,
      markClean,
      saveDraft: {
        closeSavePanel,
        openSavePanel: vi.fn(),
        overwriteTargetId: 'border-1',
        saveMode: 'overwrite',
        saveName: 'Preset',
        savePanelOpen: true,
        setOverwriteTargetId: vi.fn(),
        setSaveMode,
        setSaveName: vi.fn(),
      },
      setSelectedPresetId: vi.fn(),
    });

    panel.onModeChange('create');
    panel.onSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(panel.overwriteOptions.map((option) => option.value)).toEqual(['border-1']);
    expect(storageMocks.updateBorderPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'border-1',
        name: 'Preset',
        order: 3,
        enabled: true,
        padding: { top: 2, right: 2, bottom: 2, left: 2 },
        color: '#123456',
      })
    );
    expect(markClean).toHaveBeenCalledWith(
      expect.objectContaining({
        borderPresetId: null,
        customCss: '',
        inheritCustomCss: false,
        strokeColor: '#123456',
      }),
      'border-1'
    );
    expect(closeSavePanel).toHaveBeenCalledOnce();
    expect(setSaveMode).toHaveBeenCalledWith('create');
  });

  it('creates a new border preset and surfaces save failures', async () => {
    const setSelectedPresetId = vi.fn();
    storageMocks.addBorderPreset.mockRejectedValueOnce(new Error('failed'));
    const closeSavePanel = vi.fn();
    const panel = buildBorderPresetSavePanel({
      borderPresets: [],
      currentSettings: { strokeColor: '#abcdef' } as never,
      markClean: vi.fn(),
      saveDraft: {
        closeSavePanel,
        openSavePanel: vi.fn(),
        overwriteTargetId: '',
        saveMode: 'create',
        saveName: ' Fresh border ',
        savePanelOpen: true,
        setOverwriteTargetId: vi.fn(),
        setSaveMode: vi.fn(),
        setSaveName: vi.fn(),
      },
      setSelectedPresetId,
    });

    expect(panel.overwriteHint).toBe('editor.compact.templateOverwriteUnavailableHint');
    panel.onSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(storageMocks.addBorderPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'generated',
        name: 'Fresh border',
        color: '#abcdef',
      })
    );
    expect(setSelectedPresetId).not.toHaveBeenCalled();
    expect(closeSavePanel).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
  });

  it('normalizes hidden fill color before marking border presets clean', async () => {
    const markClean = vi.fn();
    const panel = buildBorderPresetSavePanel({
      borderPresets: [],
      currentSettings: {
        fillColor: '#00000000',
        fillOpacity: 0,
        strokeColor: '#abcdef',
        strokeOpacity: 1,
      } as never,
      markClean,
      saveDraft: {
        closeSavePanel: vi.fn(),
        openSavePanel: vi.fn(),
        overwriteTargetId: '',
        saveMode: 'create',
        saveName: 'Fresh border',
        savePanelOpen: true,
        setOverwriteTargetId: vi.fn(),
        setSaveMode: vi.fn(),
        setSaveName: vi.fn(),
      },
      setSelectedPresetId: vi.fn(),
    });

    panel.onSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(markClean).toHaveBeenCalledWith(
      expect.objectContaining({
        borderPresetId: null,
        fillColor: 'transparent',
        fillOpacity: 0,
      }),
      'generated'
    );
  });
});
