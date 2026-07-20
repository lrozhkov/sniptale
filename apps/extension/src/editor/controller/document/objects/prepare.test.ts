import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyBaseInteractionPatch: vi.fn(),
  applyEditorObjectInteractionControls: vi.fn(),
  applyLineLikeRichShapeControls: vi.fn(),
  applyTextCalloutRendering: vi.fn(),
  attachEditorTextboxLifecycle: vi.fn(),
  getArrowInteractionAppearance: vi.fn(() => ({ hasBorders: false })),
  getArrowSettings: vi.fn(() => ({ width: 4 })),
  isArrowObject: vi.fn(() => false),
  isGroup: vi.fn(() => false),
  isTextbox: vi.fn(() => false),
  refreshPreparedObjectGeometry: vi.fn(),
}));

vi.mock('../../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/helpers')>()),
  isGroup: mocks.isGroup,
  isTextbox: mocks.isTextbox,
}));

vi.mock('../../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/arrow')>()),
  getArrowInteractionAppearance: mocks.getArrowInteractionAppearance,
  getArrowSettings: mocks.getArrowSettings,
  isArrowObject: mocks.isArrowObject,
}));

vi.mock('../../../objects/annotation/text/callout/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/text/callout/lifecycle')>()),
  applyTextCalloutRendering: mocks.applyTextCalloutRendering,
}));

vi.mock('../interaction-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../interaction-controls')>()),
  applyEditorObjectInteractionControls: mocks.applyEditorObjectInteractionControls,
}));

vi.mock('./geometry-refresh', () => ({
  refreshPreparedObjectGeometry: mocks.refreshPreparedObjectGeometry,
}));

vi.mock('./interaction-patches', () => ({
  applyBaseInteractionPatch: mocks.applyBaseInteractionPatch,
}));

vi.mock('./rich-shape-controls', () => ({
  applyLineLikeRichShapeControls: mocks.applyLineLikeRichShapeControls,
}));

vi.mock('./textbox-lifecycle', () => ({
  attachEditorTextboxLifecycle: mocks.attachEditorTextboxLifecycle,
}));

import { prepareEditorObject } from './prepare';

it('orchestrates object preparation through role owners', () => {
  const child = { set: vi.fn() };
  const object = {
    getObjects: vi.fn(() => [child]),
    sniptaleLocked: true,
    sniptaleType: 'text',
  };
  const options = {
    onTextboxExitCommit: vi.fn(),
    onTextboxExitEmpty: vi.fn(),
  };
  mocks.isArrowObject.mockReturnValue(true);
  mocks.isGroup.mockReturnValue(true);
  mocks.isTextbox.mockReturnValue(true);

  prepareEditorObject(object as never, options);

  expect(mocks.applyBaseInteractionPatch).toHaveBeenCalledWith(
    object,
    expect.objectContaining({ arrowObject: true, locked: true })
  );
  expect(child.set).toHaveBeenCalledWith({ evented: false, selectable: false });
  expect(mocks.applyLineLikeRichShapeControls).toHaveBeenCalledWith(object);
  expect(mocks.applyTextCalloutRendering).toHaveBeenCalledWith(object);
  expect(mocks.attachEditorTextboxLifecycle).toHaveBeenCalledWith(
    object,
    expect.objectContaining({ onCommit: options.onTextboxExitCommit })
  );
  expect(mocks.refreshPreparedObjectGeometry).toHaveBeenCalledWith(object, { width: 4 });
  expect(mocks.applyEditorObjectInteractionControls).toHaveBeenCalledTimes(2);
});
