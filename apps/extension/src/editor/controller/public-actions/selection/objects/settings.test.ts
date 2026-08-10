import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applySelectionToolSettingsToObjects: vi.fn(),
  getMutableEditorSelection: vi.fn(),
  getSingleSelectionType: vi.fn(),
  selectionToolSettings: { pencil: { color: '#111111', width: 4 } },
}));

vi.mock('../../../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => ({ selectionToolSettings: mocks.selectionToolSettings }) },
}));
vi.mock('../../../selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection')>()),
  applySelectionToolSettingsToObjects: mocks.applySelectionToolSettingsToObjects,
}));
vi.mock('../../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../document/model')>()),
  getSingleSelectionType: mocks.getSingleSelectionType,
}));
vi.mock('./active-selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./active-selection')>()),
  getMutableEditorSelection: mocks.getMutableEditorSelection,
}));

import { applyEditorSelectionSettings, previewEditorSelectionSettings } from './settings';

beforeEach(() => vi.clearAllMocks());

function options(canvas: unknown) {
  return {
    canvas,
    commitHistory: vi.fn(),
    prepareObject: vi.fn(),
    syncRuntimeState: vi.fn(),
    withHistoryMuted: vi.fn((callback: () => unknown) => callback()),
  };
}

it('ignores missing canvas, immutable selection, and mixed selection types', () => {
  const missing = options(null);
  Reflect.apply(applyEditorSelectionSettings, null, [missing]);

  const canvas = { requestRenderAll: vi.fn() };
  const blocked = options(canvas);
  mocks.getMutableEditorSelection.mockReturnValueOnce(null).mockReturnValueOnce([{}]);
  mocks.getSingleSelectionType.mockReturnValueOnce(null);
  Reflect.apply(applyEditorSelectionSettings, null, [blocked]);
  Reflect.apply(applyEditorSelectionSettings, null, [blocked]);

  expect(mocks.applySelectionToolSettingsToObjects).not.toHaveBeenCalled();
  expect(blocked.commitHistory).not.toHaveBeenCalled();
});

it('applies a selection update as one muted mutation and one history event', () => {
  const canvas = { requestRenderAll: vi.fn() };
  const selected = [{ id: 'one' }, { id: 'two' }];
  const owner = options(canvas);
  mocks.getMutableEditorSelection.mockReturnValue(selected);
  mocks.getSingleSelectionType.mockReturnValue('pencil');

  Reflect.apply(applyEditorSelectionSettings, null, [owner]);

  expect(mocks.applySelectionToolSettingsToObjects).toHaveBeenCalledWith(
    canvas,
    selected,
    'pencil',
    mocks.selectionToolSettings,
    owner.prepareObject
  );
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(owner.commitHistory).toHaveBeenCalledOnce();
  expect(owner.syncRuntimeState).toHaveBeenCalledOnce();
});

it('previews the same mutation without committing history', () => {
  const canvas = { requestRenderAll: vi.fn() };
  const owner = options(canvas);
  mocks.getMutableEditorSelection.mockReturnValue([{}]);
  mocks.getSingleSelectionType.mockReturnValue('shape');

  Reflect.apply(previewEditorSelectionSettings, null, [owner]);

  expect(owner.commitHistory).not.toHaveBeenCalled();
  expect(owner.syncRuntimeState).toHaveBeenCalledOnce();
});
