/* eslint-disable max-lines-per-function --
   settings action routing proof keeps border, editor, and palette branches together */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  deleteBorderPreset: vi.fn(async () => undefined),
  deleteEditorPreset: vi.fn(async () => undefined),
  saveEditorPaletteSettings: vi.fn(async () => undefined),
  setBorderPresetEnabled: vi.fn(async () => undefined),
  setDefaultBorderPreset: vi.fn(async () => undefined),
  setDefaultEditorPreset: vi.fn(async () => undefined),
  setEditorPresetEnabled: vi.fn(async () => undefined),
  updateBorderPresetsOrder: vi.fn(async () => undefined),
  updateEditorPresetOrder: vi.fn(async () => undefined),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteBorderPreset: storageMocks.deleteBorderPreset,
  setBorderPresetEnabled: storageMocks.setBorderPresetEnabled,
  setDefaultBorderPreset: storageMocks.setDefaultBorderPreset,
  updateBorderPresetsOrder: storageMocks.updateBorderPresetsOrder,
}));

vi.mock('../../../composition/persistence/editor-presets', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteEditorPreset: storageMocks.deleteEditorPreset,
  saveEditorPaletteSettings: storageMocks.saveEditorPaletteSettings,
  setDefaultEditorPreset: storageMocks.setDefaultEditorPreset,
  setEditorPresetEnabled: storageMocks.setEditorPresetEnabled,
  updateEditorPresetOrder: storageMocks.updateEditorPresetOrder,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    error: toastErrorMock,
  },
}));

import { createPaletteActions, createPresetActions } from './actions';

describe('settings/editor-section actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes rectangle preset mutations and reorder through the border preset storage seam', async () => {
    const setDraggedPresetId = vi.fn();
    const setDragOverPresetId = vi.fn();
    const actions = createPresetActions({
      currentPresets: [{ id: 'preset-1' }, { id: 'preset-2' }],
      draggedPresetId: 'preset-1',
      presetOwner: 'rectangle',
      setDraggedPresetId,
      setDragOverPresetId,
    });

    await actions.handleTogglePresetEnabled('preset-1', false);
    await actions.handleMakeDefaultPreset('preset-2');
    await actions.handleDeletePreset('preset-2');
    await actions.handlePresetDrop('preset-2');

    expect(storageMocks.setBorderPresetEnabled).toHaveBeenCalledWith('preset-1', false);
    expect(storageMocks.setDefaultBorderPreset).toHaveBeenCalledWith('preset-2');
    expect(storageMocks.deleteBorderPreset).toHaveBeenCalledWith('preset-2');
    expect(storageMocks.updateBorderPresetsOrder).toHaveBeenCalledWith(['preset-2', 'preset-1']);
    expect(setDraggedPresetId).toHaveBeenLastCalledWith(null);
    expect(setDragOverPresetId).toHaveBeenLastCalledWith(null);
  });

  it('routes managed preset mutations and ignores no-op drag drops', async () => {
    const setDraggedPresetId = vi.fn();
    const setDragOverPresetId = vi.fn();
    const actions = createPresetActions({
      currentPresets: [{ id: 'preset-1' }],
      draggedPresetId: 'preset-1',
      presetOwner: 'text',
      setDraggedPresetId,
      setDragOverPresetId,
    });

    await actions.handleTogglePresetEnabled('preset-1', true);
    await actions.handleMakeDefaultPreset('preset-1');
    await actions.handleDeletePreset('preset-1');
    await actions.handlePresetDrop('preset-1');

    expect(storageMocks.setEditorPresetEnabled).toHaveBeenCalledWith('text', 'preset-1', true);
    expect(storageMocks.setDefaultEditorPreset).toHaveBeenCalledWith('text', 'preset-1');
    expect(storageMocks.deleteEditorPreset).toHaveBeenCalledWith('text', 'preset-1');
    expect(storageMocks.updateEditorPresetOrder).not.toHaveBeenCalled();
  });

  it('saves palette changes, reorders colors, and reports storage errors', async () => {
    const setDraggedColorIndex = vi.fn();
    const setDragOverColorIndex = vi.fn();
    const actions = createPaletteActions({
      draggedColorIndex: 0,
      editorPalette: {
        sceneBackground: ['#555555'],
        shapeFill: ['#333333'],
        shapeStroke: ['#111111', '#222222'],
        textBackground: ['#444444'],
        textColor: ['#666666'],
      },
      paletteKey: 'shapeStroke',
      setDraggedColorIndex,
      setDragOverColorIndex,
    });

    await actions.handlePaletteColorChange(1, '#abcdef');
    await actions.handlePaletteDrop(1);

    expect(storageMocks.saveEditorPaletteSettings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ shapeStroke: ['#111111', '#abcdef'] })
    );
    expect(storageMocks.saveEditorPaletteSettings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ shapeStroke: ['#222222', '#111111'] })
    );
    expect(setDraggedColorIndex).toHaveBeenLastCalledWith(null);
    expect(setDragOverColorIndex).toHaveBeenLastCalledWith(null);

    storageMocks.saveEditorPaletteSettings.mockRejectedValueOnce(new Error('failed'));
    await actions.handlePaletteColorChange(0, '#123456');

    expect(toastErrorMock).toHaveBeenCalledOnce();
  });

  it('reports preset-storage failures and keeps no-op drag branches side-effect free', async () => {
    storageMocks.setBorderPresetEnabled.mockRejectedValueOnce(new Error('failed'));
    storageMocks.setDefaultBorderPreset.mockRejectedValueOnce(new Error('failed'));
    const setDraggedPresetId = vi.fn();
    const setDragOverPresetId = vi.fn();
    const presetActions = createPresetActions({
      currentPresets: [{ id: 'preset-1' }],
      draggedPresetId: null,
      presetOwner: 'rectangle',
      setDraggedPresetId,
      setDragOverPresetId,
    });
    const paletteActions = createPaletteActions({
      draggedColorIndex: null,
      editorPalette: {
        sceneBackground: ['#555555'],
        shapeFill: ['#333333'],
        shapeStroke: ['#111111'],
        textBackground: ['#444444'],
        textColor: ['#666666'],
      },
      paletteKey: 'shapeStroke',
      setDraggedColorIndex: vi.fn(),
      setDragOverColorIndex: vi.fn(),
    });

    presetActions.handlePresetDragOver('preset-1');
    presetActions.handlePresetDragEnd();
    await presetActions.handleTogglePresetEnabled('preset-1', true);
    await presetActions.handleMakeDefaultPreset('preset-1');
    await presetActions.handlePresetDrop('preset-1');
    paletteActions.handlePaletteDragOver(0);
    paletteActions.handlePaletteDragEnd();
    await paletteActions.handlePaletteDrop(0);

    expect(setDragOverPresetId).toHaveBeenCalledWith(null);
    expect(setDraggedPresetId).toHaveBeenCalledWith(null);
    expect(storageMocks.updateBorderPresetsOrder).not.toHaveBeenCalled();
    expect(storageMocks.saveEditorPaletteSettings).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledTimes(2);
  });
});
