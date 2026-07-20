import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isBlurObject: vi.fn(),
  isEditableObject: vi.fn(() => true),
}));

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  isEditableObject: mocks.isEditableObject,
}));

vi.mock('../../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/blur/object')>()),
  isBlurObject: mocks.isBlurObject,
}));

import { applyBaseInteractionPatch } from './interaction-patches';

it('applies base editor interaction controls with step and blur patches', () => {
  const object = { sniptaleType: 'step', set: vi.fn() };

  applyBaseInteractionPatch(object as never, {
    arrowInteraction: null,
    arrowObject: false,
    locked: false,
  });

  expect(object.set).toHaveBeenCalledWith(
    expect.objectContaining({
      borderColor: '#f97316',
      evented: true,
      hasControls: false,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true,
      selectable: true,
    })
  );

  mocks.isBlurObject.mockReturnValueOnce(true);
  const blur = { sniptaleType: 'blur', set: vi.fn() };
  applyBaseInteractionPatch(blur as never, {
    arrowInteraction: null,
    arrowObject: false,
    locked: true,
  });
  expect(blur.set).toHaveBeenCalledWith(
    expect.objectContaining({ hasControls: false, lockScalingX: true, lockScalingY: true })
  );
});
