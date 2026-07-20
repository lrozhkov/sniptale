import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeShadowPreset: vi.fn((value) => value ?? 0),
  parseColorForStore: vi.fn((value, fallback) => value ?? fallback),
  updateSelectionShapeSettings: vi.fn(),
}));

vi.mock('fabric', () => ({
  Rect: class Rect {
    constructor(values: Record<string, unknown> = {}) {
      Object.assign(this, values);
    }
  },
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: {
        rectangle: {
          borderPresetId: null,
          fillColor: '#ffffff',
          fillOpacity: 1,
          opacity: 0.8,
          radius: 8,
          shadow: 30,
          strokeColor: '#000000',
          strokeOpacity: 1,
          strokeStyle: 'solid',
          strokeWidth: 2,
        },
      },
      updateSelectionShapeSettings: mocks.updateSelectionShapeSettings,
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

import { Rect } from 'fabric';
import { syncShapeSelectionSettings } from './shape';

describe('selection shape sync owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs shape visual settings with persisted opacity and radius metadata', () => {
    syncShapeSelectionSettings(
      new Rect({
        fill: '#ffcc00',
        sniptaleBorderPresetId: 'preset',
        sniptaleShapeFillOpacity: 0.3,
        sniptaleShapeRadius: 18,
        sniptaleShapeShadow: 'elevated',
        sniptaleShapeStrokeOpacity: 0.6,
        sniptaleShapeStrokeStyle: 'dashed',
        stroke: '#000000',
        strokeWidth: 5,
      }) as never,
      'rectangle'
    );

    expect(mocks.updateSelectionShapeSettings).toHaveBeenCalledWith(
      'rectangle',
      expect.objectContaining({
        borderPresetId: 'preset',
        fillColor: '#ffcc00',
        fillOpacity: 0.3,
        radius: 18,
        shadow: 'elevated',
        strokeOpacity: 0.6,
        strokeStyle: 'dashed',
        strokeWidth: 5,
      })
    );
  });
});
