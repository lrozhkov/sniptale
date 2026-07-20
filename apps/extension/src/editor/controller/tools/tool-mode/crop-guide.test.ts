import { expect, it, vi } from 'vitest';

import { clearCropGuideIfNeeded } from './crop-guide';

it('clears an existing crop guide when switching away from crop mode', () => {
  const clearCropSelection = vi.fn();

  clearCropGuideIfNeeded('text', true, clearCropSelection);

  expect(clearCropSelection).toHaveBeenCalledOnce();
});

it('keeps the crop guide while crop mode remains active', () => {
  const clearCropSelection = vi.fn();

  clearCropGuideIfNeeded('crop', true, clearCropSelection);
  clearCropGuideIfNeeded('text', false, clearCropSelection);

  expect(clearCropSelection).not.toHaveBeenCalled();
});
