import { beforeEach, describe, expect, it, vi } from 'vitest';

const baseBrushSelectionToolSettings = {
  arrow: {
    color: '#111',
    endHead: 'triangle',
    mode: 'straight',
    opacity: 0.5,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 2,
  },
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
  step: { alphabet: 'latin', color: '#222222', sizeLevel: 'md', type: 'number', value: '1' },
  text: {
    backgroundColor: '#eeeeee',
    backgroundOpacity: 1,
    calloutFormat: 'panel',
    fontFamily: 'sans',
    fontSize: 18,
    fontStyle: 'normal',
    fontWeight: 'bold',
    linethrough: false,
    shadow: 0,
    textColor: '#222222',
    underline: false,
  },
};

const baseShapeSelectionToolSettings = {
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

const selectionToolSettings = {
  ...baseBrushSelectionToolSettings,
  ...baseShapeSelectionToolSettings,
};

const mocks = vi.hoisted(() => ({
  getArrowSettingsMock: vi.fn(),
  isArrowObjectMock: vi.fn(() => false),
  isGroupMock: vi.fn((object: { kind?: string }) => object.kind === 'group'),
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
  normalizeTextCalloutFormat: (value: unknown) =>
    value === 'plain' ||
    value === 'panel' ||
    value === 'bubble' ||
    value === 'pointer' ||
    value === 'flag' ||
    value === 'arrow-bubble'
      ? value
      : 'bubble',
}));

import { Rect } from 'fabric';
import { syncSelectionToolSettingsFromObject } from './sync';

beforeEach(() => {
  vi.clearAllMocks();
});

it('syncs brush settings into the editor store', () => {
  syncSelectionToolSettingsFromObject(
    { opacity: 0.4, stroke: '#123123', strokeWidth: 9 } as never,
    'highlighter'
  );

  expect(mocks.updateSelectionBrushSettingsMock).toHaveBeenCalledWith('highlighter', {
    color: 'parsed:#123123',
    dynamicWidth: false,
    opacity: 0.4,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: '#ffee00',
    shadowDistance: 4,
    smoothingLevel: 4,
    width: 9,
  });
});

it('prefers persisted freehand smoothing metadata when present', () => {
  syncSelectionToolSettingsFromObject(
    { sniptaleBrushSmoothing: 8, opacity: 0.4, stroke: '#123123', strokeWidth: 9 } as never,
    'pencil'
  );

  expect(mocks.updateSelectionBrushSettingsMock).toHaveBeenCalledWith('pencil', {
    color: 'parsed:#123123',
    dynamicWidth: true,
    opacity: 0.4,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: '#ff0000',
    shadowDistance: 4,
    smoothingLevel: 8,
    width: 9,
  });
});

it('reads dynamic-width brush color from fill instead of transparent stroke', () => {
  syncSelectionToolSettingsFromObject(
    {
      fill: '#456456',
      sniptaleBrushDynamicWidth: true,
      opacity: 0.7,
      stroke: 'transparent',
      strokeWidth: 0,
    } as never,
    'pencil'
  );

  expect(mocks.updateSelectionBrushSettingsMock).toHaveBeenCalledWith('pencil', {
    color: 'parsed:#456456',
    dynamicWidth: true,
    opacity: 0.7,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: '#ff0000',
    shadowDistance: 4,
    smoothingLevel: 4,
    width: 4,
  });
});

function registerShapeSettingsSyncTest() {
  it('syncs shape settings into the editor store', () => {
    syncSelectionToolSettingsFromObject(
      new Rect({
        fill: '#ffcc00',
        sniptaleBorderPresetId: 'preset',
        sniptaleShapeCustomCss: 'outline: 1px solid red;',
        sniptaleShapeFillOpacity: 0.3,
        sniptaleShapeInheritCustomCss: true,
        sniptaleShapeShadow: 'elevated',
        sniptaleShapeStrokeOpacity: 0.6,
        sniptaleShapeStrokeStyle: 'dashed',
        opacity: 1,
        rx: 6,
        stroke: '#000000',
        strokeWidth: 5,
      }) as never,
      'rectangle'
    );

    expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenCalledWith(
      'rectangle',
      expect.objectContaining({
        borderPresetId: 'preset',
        fillColor: 'parsed:#ffcc00',
        customCss: '',
        fillOpacity: 0.3,
        inheritCustomCss: false,
        opacity: 0.6,
        radius: 6,
        strokeOpacity: 0.6,
        strokeStyle: 'dashed',
      })
    );
  });
}

function registerShapeSyncTests() {
  registerShapeSettingsSyncTest();
}

function runBrushAndShapeSyncSuite() {
  registerShapeSyncTests();
}

describe('editor-controller selection sync brush and shape seam', runBrushAndShapeSyncSuite);
