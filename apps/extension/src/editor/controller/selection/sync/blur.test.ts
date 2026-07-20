import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBlurSettings: vi.fn(() => ({ amount: 12, blurType: 'gaussian' })),
  isBlurObject: vi.fn(() => true),
  updateSelectionBlurSettings: vi.fn(),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({ updateSelectionBlurSettings: mocks.updateSelectionBlurSettings }),
  },
}));

vi.mock('../../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/blur/object')>()),
  getBlurSettings: mocks.getBlurSettings,
  isBlurObject: mocks.isBlurObject,
}));

import { syncBlurSelectionSettings } from './blur';

describe('selection blur sync owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isBlurObject.mockReturnValue(true);
  });

  it('updates blur selection settings only for blur objects', () => {
    syncBlurSelectionSettings({ id: 'blur' } as never);
    expect(mocks.updateSelectionBlurSettings).toHaveBeenCalledWith({
      amount: 12,
      blurType: 'gaussian',
    });

    mocks.isBlurObject.mockReturnValue(false);
    syncBlurSelectionSettings({ id: 'shape' } as never);
    expect(mocks.updateSelectionBlurSettings).toHaveBeenCalledTimes(1);
  });
});
