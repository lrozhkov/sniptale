import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getArrowSettings: vi.fn(() => ({
    color: '#f97316',
    endHead: 'triangle',
    mode: 'straight',
    opacity: 1,
    shadow: 20,
    startHead: 'none',
    variant: 'standard',
    width: 6,
  })),
  isArrowObject: vi.fn((object: { kind?: string }) => object.kind === 'arrow'),
  isLineObject: vi.fn((object: { kind?: string }) => object.kind === 'line'),
  updateSelectionArrowSettings: vi.fn(),
  updateSelectionLineSettings: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      updateSelectionArrowSettings: mocks.updateSelectionArrowSettings,
      updateSelectionLineSettings: mocks.updateSelectionLineSettings,
    }),
  },
}));

vi.mock('../../objects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects')>()),
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowSettings: mocks.getArrowSettings,
  isArrowObject: mocks.isArrowObject,
}));

vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  getLineSettings: vi.fn(() => ({ color: '#111111', width: 3 })),
  isLineObject: mocks.isLineObject,
}));

import { syncSelectionToolSettingsFromObject } from './sync';

describe('selection shadow sync', () => {
  it('syncs canonical arrow shadow fallbacks and ignores mismatched line objects', () => {
    syncSelectionToolSettingsFromObject({ kind: 'arrow' } as never, 'arrow');
    syncSelectionToolSettingsFromObject({ kind: 'arrow' } as never, 'line');

    expect(mocks.updateSelectionArrowSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        shadowAngle: 90,
        shadowBlur: 12,
        shadowColor: '#f97316',
        shadowDistance: 4,
      })
    );
    expect(mocks.updateSelectionLineSettings).not.toHaveBeenCalled();
  });
});
