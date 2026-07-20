import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeShadowPreset: vi.fn((value) => value ?? 0),
  parseColorForStore: vi.fn((value, fallback) => value ?? fallback),
  updateSelectionBrushSettings: vi.fn(),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: {
        pencil: {
          color: '#ff0000',
          dynamicWidth: true,
          opacity: 1,
          shadowAngle: 90,
          shadowColor: '#ff0000',
          shadowDistance: 4,
          smoothingLevel: 4,
          width: 4,
        },
      },
      updateSelectionBrushSettings: mocks.updateSelectionBrushSettings,
    }),
  },
}));

vi.mock('../../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/helpers')>()),
  parseColorForStore: mocks.parseColorForStore,
}));

vi.mock('../../../objects/shadow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/shadow')>()),
  normalizeShadowPreset: mocks.normalizeShadowPreset,
}));

import { syncBrushSelectionSettings } from './brush';

describe('selection brush sync owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads brush metadata with store fallbacks', () => {
    syncBrushSelectionSettings(
      {
        sniptaleBrushShadow: 'elevated',
        sniptaleBrushSmoothing: 8,
        opacity: 0.4,
        stroke: '#123123',
        strokeWidth: 9,
      } as never,
      'pencil'
    );

    expect(mocks.updateSelectionBrushSettings).toHaveBeenCalledWith('pencil', {
      color: '#123123',
      dynamicWidth: true,
      opacity: 0.4,
      shadow: 'elevated',
      shadowAngle: 90,
      shadowBlur: 12,
      shadowColor: '#ff0000',
      shadowDistance: 4,
      smoothingLevel: 8,
      width: 9,
    });
  });
});
