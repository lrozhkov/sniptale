import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateText: vi.fn(),
  cancelEditing: vi.fn(),
  isTextbox: vi.fn(() => true),
  isTextTarget: vi.fn(() => true),
}));

vi.mock('../../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/helpers')>()),
  isTextbox: mocks.isTextbox,
}));
vi.mock('../../document/objects/textbox-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/objects/textbox-lifecycle')>()),
  cancelEditorTextboxEditing: mocks.cancelEditing,
}));
vi.mock('../../events/text-target', () => ({
  activateTextTarget: mocks.activateText,
  isTextTarget: mocks.isTextTarget,
}));

import { cancelTextboxEditing, enterSelectedTextEditing, exitTextboxEditing } from './text-editing';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isTextbox.mockReturnValue(true);
  mocks.isTextTarget.mockReturnValue(true);
});

it('commits textbox editing and refreshes the canvas', () => {
  const activeObject = { exitEditing: vi.fn() };
  const canvas = { requestRenderAll: vi.fn() };

  Reflect.apply(exitTextboxEditing, null, [{ activeObject, canvas }]);

  expect(activeObject.exitEditing).toHaveBeenCalledOnce();
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

  mocks.isTextbox.mockReturnValue(false);
  Reflect.apply(exitTextboxEditing, null, [{ activeObject, canvas: null }]);
  expect(activeObject.exitEditing).toHaveBeenCalledOnce();
});

it('enters selected shared text without selecting its whole payload', () => {
  const activeObject = { id: 'text-1' };
  const canvas = { id: 'canvas' };
  const syncRuntimeState = vi.fn();

  Reflect.apply(enterSelectedTextEditing, null, [{ activeObject, canvas, syncRuntimeState }]);

  expect(mocks.activateText).toHaveBeenCalledWith(canvas, activeObject, syncRuntimeState, {
    selectAll: false,
  });
  Reflect.apply(enterSelectedTextEditing, null, [{ activeObject, canvas }]);
  expect(mocks.activateText).toHaveBeenLastCalledWith(canvas, activeObject, expect.any(Function), {
    selectAll: false,
  });
});

it('does not enter text editing without a canvas, selection, or shared text target', () => {
  const activeObject = { id: 'shape-1' };
  Reflect.apply(enterSelectedTextEditing, null, [{ activeObject, canvas: null }]);
  Reflect.apply(enterSelectedTextEditing, null, [{ activeObject: undefined, canvas: {} }]);
  mocks.isTextTarget.mockReturnValue(false);
  Reflect.apply(enterSelectedTextEditing, null, [{ activeObject, canvas: {} }]);

  expect(mocks.activateText).not.toHaveBeenCalled();
});

it('cancels an active Fabric textbox and refreshes canvas and runtime state', () => {
  const activeObject = { id: 'text-1' };
  const canvas = { requestRenderAll: vi.fn() };
  const syncRuntimeState = vi.fn();

  Reflect.apply(cancelTextboxEditing, null, [{ activeObject, canvas, syncRuntimeState }]);

  expect(mocks.cancelEditing).toHaveBeenCalledWith(activeObject);
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
});

it('does not mutate a non-text selection and tolerates absent optional owners', () => {
  mocks.isTextbox.mockReturnValue(false);
  Reflect.apply(cancelTextboxEditing, null, [{ activeObject: { id: 'shape-1' }, canvas: null }]);

  expect(mocks.cancelEditing).not.toHaveBeenCalled();
});
