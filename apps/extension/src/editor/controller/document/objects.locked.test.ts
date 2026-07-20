import { expect, it, vi } from 'vitest';

vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  isBlurObject: vi.fn(() => false),
}));

vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowInteractionAppearance: vi.fn(() => null),
  getArrowSettings: vi.fn(() => null),
  isArrowObject: vi.fn(() => false),
}));

vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  isEditableObject: vi.fn(() => true),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isGroup: vi.fn(() => false),
  isTextbox: vi.fn(() => false),
}));

import { prepareEditorObject } from './objects/prepare';

it('keeps locked editor objects selectable while disabling transforms', () => {
  const object = {
    cornerSize: 8,
    cornerStyle: 'rect',
    sniptaleLocked: true,
    set: vi.fn(),
  };

  prepareEditorObject(object as never, {
    onTextboxExitCommit: vi.fn(),
    onTextboxExitEmpty: vi.fn(),
  });

  expect(object.set).toHaveBeenCalledWith(
    expect.objectContaining({
      evented: true,
      hasControls: false,
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true,
      selectable: true,
    })
  );
});
