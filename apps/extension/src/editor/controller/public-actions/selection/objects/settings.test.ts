import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applySelectionToolSettingsToObjects: vi.fn(),
  readEditorDrawingObject: vi.fn(),
  requestEditorSimplify: vi.fn(),
  cancelPendingEditorSimplify: vi.fn(),
  getMutableEditorSelection: vi.fn(),
  getSingleSelectionType: vi.fn(),
  selectionToolSettings: {
    pencil: { color: '#111111', width: 4 },
    blur: { amount: 6, clean: false },
  },
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

vi.mock('../../../../drawing/object/metadata', () => ({
  readEditorDrawingObject: mocks.readEditorDrawingObject,
}));
vi.mock('../../../../drawing/simplify-runtime', () => ({
  requestEditorSimplify: mocks.requestEditorSimplify,
  cancelPendingEditorSimplify: mocks.cancelPendingEditorSimplify,
}));

import { applyEditorSelectionSettings, previewEditorSelectionSettings } from './settings';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectionToolSettings.blur.clean = false;
});

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

it('converts selected shared Blur layers and leaves existing cleanup unchanged until compute accepts', () => {
  const canvas = { requestRenderAll: vi.fn() };
  const blur = { id: 'blur' };
  const cleanup = { id: 'cleanup' };
  const legacy = { id: 'legacy' };
  const owner = options(canvas);
  mocks.selectionToolSettings.blur.clean = true;
  mocks.getMutableEditorSelection.mockReturnValue([blur, cleanup, legacy]);
  mocks.getSingleSelectionType.mockReturnValue('blur');
  mocks.readEditorDrawingObject
    .mockReturnValueOnce({
      id: 'blur',
      kind: 'blur',
      bounds: { x: 10, y: 20, width: 60, height: 40 },
      amount: 6,
    })
    .mockReturnValueOnce({ kind: 'simplify', settings: { erase: true } })
    .mockReturnValueOnce(null);
  Reflect.apply(applyEditorSelectionSettings, null, [owner]);
  expect(mocks.requestEditorSimplify).toHaveBeenCalledExactlyOnceWith(
    canvas,
    blur,
    expect.objectContaining({ erase: true }),
    false,
    false,
    expect.objectContaining({
      id: 'blur',
      kind: 'simplify',
      blurAmount: 6,
      bounds: { x: 10, y: 20, width: 60, height: 40 },
    })
  );
  expect(mocks.applySelectionToolSettingsToObjects).not.toHaveBeenCalled();
  expect(owner.commitHistory).not.toHaveBeenCalled();
  expect(owner.syncRuntimeState).not.toHaveBeenCalled();
});

it('cancels pending cleanup before committing the selected Blur strength', () => {
  const canvas = { requestRenderAll: vi.fn() };
  const selected = [{}];
  const owner = options(canvas);
  mocks.getMutableEditorSelection.mockReturnValue(selected);
  mocks.getSingleSelectionType.mockReturnValue('blur');
  Reflect.apply(applyEditorSelectionSettings, null, [owner]);
  expect(mocks.cancelPendingEditorSimplify).toHaveBeenCalledExactlyOnceWith(canvas);
  expect(mocks.cancelPendingEditorSimplify.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.applySelectionToolSettingsToObjects.mock.invocationCallOrder[0]!
  );
  expect(owner.commitHistory).toHaveBeenCalledOnce();
});

it('previews Blur strength without canceling submitted cleanup or committing history', () => {
  const canvas = { requestRenderAll: vi.fn() };
  const owner = options(canvas);
  mocks.selectionToolSettings.blur.clean = true;
  mocks.getMutableEditorSelection.mockReturnValue([{}]);
  mocks.getSingleSelectionType.mockReturnValue('blur');
  Reflect.apply(previewEditorSelectionSettings, null, [owner]);
  expect(mocks.cancelPendingEditorSimplify).not.toHaveBeenCalled();
  expect(mocks.requestEditorSimplify).not.toHaveBeenCalled();
  expect(owner.commitHistory).not.toHaveBeenCalled();
  expect(owner.syncRuntimeState).toHaveBeenCalledOnce();
});
