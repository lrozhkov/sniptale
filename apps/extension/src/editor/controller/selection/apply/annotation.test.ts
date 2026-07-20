import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isBlurObject: vi.fn(),
  isGroup: vi.fn(),
  updateBlurObject: vi.fn(),
  updateStepGroup: vi.fn(),
}));

vi.mock('../../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/helpers')>()),
  isGroup: mocks.isGroup,
}));

vi.mock('../../../objects/annotation/blur/object/identity', () => ({
  isBlurObject: mocks.isBlurObject,
}));

vi.mock('../../../objects/annotation/blur/object/update', () => ({
  updateBlurObject: mocks.updateBlurObject,
}));

vi.mock('../../../objects/annotation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation')>()),
  updateStepGroup: mocks.updateStepGroup,
}));

import { applyBlurSettings, applyStepSettings } from './annotation';

it('applies step settings only to groups and blur settings only to blur objects', () => {
  const step = { id: 'step' };
  const blur = { id: 'blur' };
  mocks.isGroup.mockImplementation((object) => object === step);
  mocks.isBlurObject.mockImplementation((object) => object === blur);

  applyStepSettings([step, blur] as never, { value: '3' } as never);
  applyBlurSettings([step, blur] as never, { amount: 12 } as never);

  expect(mocks.updateStepGroup).toHaveBeenCalledWith(step, { value: '3' });
  expect(mocks.updateBlurObject).toHaveBeenCalledWith(blur, { settings: { amount: 12 } });
});
