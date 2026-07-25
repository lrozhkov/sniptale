import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorShapeSettings } from '../../../../features/editor/document/types';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';

type TestMutationOutcome = 'applied' | 'rejected' | 'unchanged';

const storageMocks = vi.hoisted(() => ({
  addBorderPresetWithOutcome: vi.fn(async (): Promise<TestMutationOutcome> => 'applied'),
  updateBorderPresetWithOutcome: vi.fn(async (): Promise<TestMutationOutcome> => 'applied'),
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

function createShapeSettings(overrides: Partial<EditorShapeSettings> = {}): EditorShapeSettings {
  return {
    ...DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).rectangle,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.addBorderPresetWithOutcome.mockResolvedValue('applied');
  storageMocks.updateBorderPresetWithOutcome.mockResolvedValue('applied');
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
          origin: 'system',
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
    expect(storageMocks.updateBorderPresetWithOutcome).toHaveBeenCalledWith(
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
    storageMocks.addBorderPresetWithOutcome.mockRejectedValueOnce(new Error('failed'));
    const closeSavePanel = vi.fn();
    const panel = buildBorderPresetSavePanel({
      borderPresets: [],
      currentSettings: createShapeSettings({ strokeColor: '#abcdef' }),
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

    expect(storageMocks.addBorderPresetWithOutcome).toHaveBeenCalledWith(
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

  it('does not advance editor state when the preset owner rejects the target', async () => {
    const closeSavePanel = vi.fn();
    const markClean = vi.fn();
    const setSelectedPresetId = vi.fn();
    storageMocks.addBorderPresetWithOutcome.mockResolvedValueOnce('rejected');
    const panel = buildBorderPresetSavePanel({
      borderPresets: [],
      currentSettings: createShapeSettings({ strokeColor: '#abcdef' }),
      markClean,
      saveDraft: {
        closeSavePanel,
        openSavePanel: vi.fn(),
        overwriteTargetId: '',
        saveMode: 'create',
        saveName: 'Rejected border',
        savePanelOpen: true,
        setOverwriteTargetId: vi.fn(),
        setSaveMode: vi.fn(),
        setSaveName: vi.fn(),
      },
      setSelectedPresetId,
    });

    panel.onSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(setSelectedPresetId).not.toHaveBeenCalled();
    expect(markClean).not.toHaveBeenCalled();
    expect(closeSavePanel).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
  });
});
