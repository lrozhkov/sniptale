import { beforeEach, expect, it, vi } from 'vitest';

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
  pencil: {
    color: '#ff0000',
    dynamicWidth: true,
    opacity: 1,
    shapeCorrection: 'subtle',
    shadow: 0,
    shadowAngle: 90,
    shadowColor: '#ff0000',
    smoothingLevel: 4,
    width: 4,
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

beforeEach(() => {
  vi.clearAllMocks();
});

it('uses persisted dynamic-width metadata before Fabric stroke fallback fields', () => {
  syncSelectionToolSettingsFromObject(
    {
      fill: '#123456',
      sniptaleBrushDynamicWidth: true,
      sniptaleBrushShadowAngle: 180,
      sniptaleBrushShadowColor: '#123123',
      sniptaleBrushSmoothing: 9,
      sniptaleBrushWidth: 11,
      opacity: 0.6,
      stroke: 'transparent',
      strokeWidth: 0,
    } as never,
    'pencil'
  );

  expect(mocks.updateSelectionBrushSettingsMock).toHaveBeenCalledWith('pencil', {
    color: 'parsed:#123456',
    dynamicWidth: true,
    opacity: 0.6,
    shadow: 0,
    shadowAngle: 180,
    shadowBlur: 12,
    shadowColor: '#123123',
    shadowDistance: 4,
    smoothingLevel: 9,
    width: 11,
  });
});

it('falls back to selection brush defaults when metadata is absent', () => {
  const storedShadowColor = selectionToolSettings.highlighter.shadowColor;
  delete (selectionToolSettings.highlighter as { shadowColor?: string }).shadowColor;

  syncSelectionToolSettingsFromObject({ opacity: 0.5, stroke: '#abcdef' } as never, 'highlighter');
  selectionToolSettings.highlighter.shadowColor = storedShadowColor;

  expect(mocks.updateSelectionBrushSettingsMock).toHaveBeenCalledWith('highlighter', {
    color: 'parsed:#abcdef',
    dynamicWidth: false,
    opacity: 0.5,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: '#ffee00',
    shadowDistance: 4,
    smoothingLevel: 4,
    width: 12,
  });
});
