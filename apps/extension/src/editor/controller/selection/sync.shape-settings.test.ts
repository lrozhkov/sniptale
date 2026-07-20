import { beforeEach, expect, it, vi } from 'vitest';

const selectionToolSettings = {
  ellipse: {
    borderPresetId: null,
    customCss: '',
    fillColor: '#ffffff',
    fillOpacity: 1,
    inheritCustomCss: false,
    opacity: 0.8,
    radius: 8,
    shadow: 30,
    strokeColor: '#333333',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 4,
  },
  rectangle: {
    borderPresetId: null,
    customCss: '',
    fillColor: '#ffffff',
    fillOpacity: 1,
    inheritCustomCss: false,
    opacity: 0.8,
    radius: 8,
    shadow: 30,
    strokeColor: '#000000',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 2,
  },
};

const mocks = vi.hoisted(() => ({
  getArrowSettingsMock: vi.fn(),
  isArrowObjectMock: vi.fn(() => false),
  isGroupMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  parseColorForStoreMock: vi.fn((value: unknown, fallback: string) => {
    return value == null || value === '' ? fallback : `parsed:${String(value)}`;
  }),
  updateSelectionArrowSettingsMock: vi.fn(),
  updateSelectionBrushSettingsMock: vi.fn(),
  updateSelectionShapeSettingsMock: vi.fn(),
  updateSelectionStepSettingsMock: vi.fn(),
  updateSelectionTextSettingsMock: vi.fn(),
}));

vi.mock('fabric', () => ({
  PencilBrush: class PencilBrush {},
  Point: class Point {
    constructor(
      public x = 0,
      public y = 0
    ) {}
  },
  Rect: class Rect {
    constructor(values: Record<string, unknown> = {}) {
      Object.assign(this, values);
    }
  },
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings,
      updateSelectionArrowSettings: mocks.updateSelectionArrowSettingsMock,
      updateSelectionBrushSettings: mocks.updateSelectionBrushSettingsMock,
      updateSelectionShapeSettings: mocks.updateSelectionShapeSettingsMock,
      updateSelectionStepSettings: mocks.updateSelectionStepSettingsMock,
      updateSelectionTextSettings: mocks.updateSelectionTextSettingsMock,
    }),
  },
}));
vi.mock('../core/helpers', async () => ({
  ...(await vi.importActual<typeof import('../core/helpers')>('../core/helpers')),
  isGroup: mocks.isGroupMock,
  isTextbox: mocks.isTextboxMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));
vi.mock('../../objects', async () => ({
  ...(await vi.importActual<typeof import('../../objects')>('../../objects')),
  getArrowSettings: mocks.getArrowSettingsMock,
  isArrowObject: mocks.isArrowObjectMock,
}));

import { Rect } from 'fabric';
import { syncSelectionToolSettingsFromObject } from './sync';

beforeEach(() => {
  vi.clearAllMocks();
});

it('syncs every geometric shape branch into shared shape settings', () => {
  syncSelectionToolSettingsFromObject(new Rect({ stroke: '#111111' }) as never, 'ellipse');
  syncSelectionToolSettingsFromObject(new Rect({ stroke: '#222222' }) as never, 'diamond');

  expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenCalledTimes(2);
  expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenNthCalledWith(
    1,
    'ellipse',
    expect.objectContaining({ strokeColor: 'parsed:#111111' })
  );
  expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenNthCalledWith(
    2,
    'rectangle',
    expect.objectContaining({ strokeColor: 'parsed:#222222' })
  );
});

it('falls back to stored shape opacity metadata instead of baked object opacity', () => {
  syncSelectionToolSettingsFromObject(
    new Rect({
      sniptaleShapeCustomCss: 'outline: 1px solid red;',
      opacity: 0.1,
      stroke: '#abcdef',
    }) as never,
    'rectangle'
  );

  expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenCalledWith(
    'rectangle',
    expect.objectContaining({
      customCss: '',
      fillOpacity: 1,
      inheritCustomCss: false,
      opacity: 1,
      strokeOpacity: 1,
    })
  );
});

it('uses persisted rectangle radius intent before the clamped render radius', () => {
  syncSelectionToolSettingsFromObject(
    new Rect({
      sniptaleShapeRadius: 18,
      rx: 10,
      stroke: '#000000',
    }) as never,
    'rectangle'
  );

  expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenCalledWith(
    'rectangle',
    expect.objectContaining({ radius: 18 })
  );
});
