/* eslint-disable max-lines-per-function -- editor preset save proof keeps create/overwrite flows together */
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

function createTextSettings(fontSize: number) {
  return {
    calloutFormat: 'panel' as const,
    layoutMode: 'fixed-width' as const,
    textAlign: 'left' as const,
    verticalAlign: 'top' as const,
    fontFamily: 'Arial' as never,
    fontSize,
    fontWeight: 'normal' as const,
    fontStyle: 'normal' as const,
    underline: false,
    linethrough: false,
    textColor: '#ffffff',
    textOpacity: 1,
    backgroundColor: '#111111',
    backgroundOpacity: 0.4,
    shadow: 0,
    shadowAngle: 90,
    shadowColor: '#ffffff',
    tailSize: 12,
  };
}

function createEllipseSettings(strokeColor: string, strokeStyle: 'solid' | 'dashed') {
  return {
    borderPresetId: 'border-1',
    customCss: 'outline: 1px solid red;',
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: true,
    opacity: 0.4,
    radius: 8,
    shadow: 30,
    strokeColor,
    strokeOpacity: 0.7,
    strokeStyle,
    strokeWidth: 4,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.addEditorPreset.mockResolvedValue(undefined);
  storageMocks.updateEditorPreset.mockResolvedValue(undefined);
  vi.stubGlobal('crypto', { randomUUID: () => 'preset-new' });
});

describe('buildStoredPresetSavePanel', () => {
  it('builds overwrite mode and updates the selected stored preset', async () => {
    const markClean = vi.fn();
    const closeSavePanel = vi.fn();
    const setSaveName = vi.fn();
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
      currentSettings: createArrowSettings(6),
      family: 'arrow',
      markClean,
      saveDraft: {
        closeSavePanel,
        openSavePanel: vi.fn(),
        overwriteTargetId: 'preset-1',
        saveMode: 'overwrite',
        saveName: 'Preset 1',
        savePanelOpen: true,
        setOverwriteTargetId: vi.fn(),
        setSaveMode: vi.fn(),
        setSaveName,
      },
      setSelectedPresetId: vi.fn(),
    });

    expect(panel.canSave).toBe(true);
    panel.onNameChange('Preset 2');
    panel.onSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(storageMocks.updateEditorPreset).toHaveBeenCalledWith('arrow', {
      id: 'preset-1',
      name: 'Preset 1',
      order: 0,
      enabled: true,
      settings: createArrowSettings(6),
    });
    expect(markClean).toHaveBeenCalledWith(createArrowSettings(6), 'preset-1');
    expect(closeSavePanel).toHaveBeenCalledOnce();
    expect(setSaveName).toHaveBeenCalledWith('Preset 2');
  });

  it('builds create mode, appends a preset, and surfaces save failures', async () => {
    const setSelectedPresetId = vi.fn();
    storageMocks.addEditorPreset.mockRejectedValueOnce(new Error('failed'));

    const panel = buildStoredPresetSavePanel({
      collection: {
        defaultPresetId: 'preset-1',
        presets: [
          {
            id: 'preset-1',
            name: 'Preset 1',
            order: 4,
            enabled: true,
            settings: createTextSettings(20),
          },
        ],
      },
      currentSettings: createTextSettings(24),
      family: 'text',
      markClean: vi.fn(),
      saveDraft: {
        closeSavePanel: vi.fn(),
        openSavePanel: vi.fn(),
        overwriteTargetId: '',
        saveMode: 'create',
        saveName: ' New preset ',
        savePanelOpen: true,
        setOverwriteTargetId: vi.fn(),
        setSaveMode: vi.fn(),
        setSaveName: vi.fn(),
      },
      setSelectedPresetId,
    });

    expect(panel.canSave).toBe(true);
    expect(panel.overwriteHint).toBeUndefined();
    panel.onSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(storageMocks.addEditorPreset).toHaveBeenCalledWith('text', {
      id: 'preset-new',
      name: 'New preset',
      order: 5,
      enabled: true,
      settings: createTextSettings(24),
    });
    expect(setSelectedPresetId).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
  });

  it('sanitizes shape presets before storing them in editor-owned families', async () => {
    const markClean = vi.fn();
    const closeSavePanel = vi.fn();
    const panel = buildStoredPresetSavePanel({
      collection: {
        defaultPresetId: 'preset-1',
        presets: [
          {
            id: 'preset-1',
            name: 'Preset 1',
            order: 0,
            enabled: true,
            settings: createEllipseSettings('#111111', 'solid'),
          },
        ],
      },
      currentSettings: createEllipseSettings('#abcdef', 'dashed'),
      family: 'ellipse',
      markClean,
      saveDraft: {
        closeSavePanel,
        openSavePanel: vi.fn(),
        overwriteTargetId: 'preset-1',
        saveMode: 'overwrite',
        saveName: 'Preset 1',
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

    expect(storageMocks.updateEditorPreset).toHaveBeenCalledWith('ellipse', {
      id: 'preset-1',
      name: 'Preset 1',
      order: 0,
      enabled: true,
      settings: expect.objectContaining({
        customCss: '',
        inheritCustomCss: false,
        opacity: 0.7,
        radius: 0,
        strokeColor: '#abcdef',
        strokeStyle: 'dashed',
      }),
    });
    expect(markClean).toHaveBeenCalledWith(
      expect.objectContaining({
        borderPresetId: null,
        customCss: '',
        fillColor: 'transparent',
        fillOpacity: 0,
        inheritCustomCss: false,
        opacity: 0.7,
        radius: 0,
      }),
      'preset-1'
    );
  });
});
