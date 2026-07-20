import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectionToolSettings = {
  highlighter: {
    color: '#ffee00',
    dynamicWidth: false,
    opacity: 0.3,
    shapeCorrection: 'off',
    shadow: 0,
    shadowAngle: 90,
    shadowColor: '#ffee00',
    smoothingLevel: 4,
    width: 12,
  },
};

const mocks = vi.hoisted(() => ({
  parseColorForStoreMock: vi.fn((value: unknown, fallback: string) => {
    return value == null || value === '' ? fallback : `parsed:${String(value)}`;
  }),
  updateSelectionBrushSettingsMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings,
      updateSelectionBrushSettings: mocks.updateSelectionBrushSettingsMock,
    }),
  },
}));
vi.mock('../core/helpers', async () => ({
  ...(await vi.importActual<typeof import('../core/helpers')>('../core/helpers')),
  parseColorForStore: mocks.parseColorForStoreMock,
}));

import { syncSelectionToolSettingsFromObject } from './sync';

describe('editor-controller selection sync brush opacity seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs committed highlighter opacity from rgba stroke instead of object opacity', () => {
    syncSelectionToolSettingsFromObject(
      {
        opacity: 1,
        stroke: 'rgba(255, 238, 0, 0.4)',
        strokeWidth: 12,
      } as never,
      'highlighter'
    );

    expect(mocks.updateSelectionBrushSettingsMock).toHaveBeenCalledWith(
      'highlighter',
      expect.objectContaining({
        color: 'parsed:rgba(255, 238, 0, 0.4)',
        opacity: 0.4,
      })
    );
  });
});
