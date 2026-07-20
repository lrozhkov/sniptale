import { beforeEach, describe, expect, it, vi } from 'vitest';

function createShapeSettings() {
  return {
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
  };
}

const selectionToolSettings = vi.hoisted(() => ({
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
  blur: { amount: 12, blurType: 'gaussian' as const, showBorder: false },
  ellipse: createShapeSettings(),
  highlighter: { color: '#ffee00', opacity: 0.3, shadow: 0, smoothingLevel: 4, width: 12 },
  pencil: { color: '#ff0000', opacity: 1, shadow: 0, smoothingLevel: 4, width: 4 },
  rectangle: createShapeSettings(),
  diamond: createShapeSettings(),
  step: { alphabet: 'latin', color: '#222222', sizeLevel: 'md', type: 'number', value: '1' },
  text: {
    backgroundColor: '#eeeeee',
    backgroundOpacity: 1,
    calloutFormat: 'panel',
    fontFamily: 'sans',
    fontSize: 18,
    fontStyle: 'normal',
    fontWeight: 'bold',
    layoutMode: 'fixed-width',
    linethrough: false,
    shadow: 0,
    textAlign: 'left',
    textColor: '#222222',
    underline: false,
  },
}));

const mocks = vi.hoisted(() => ({
  getArrowSettingsMock: vi.fn(() => ({
    color: '#f60',
    endHead: 'open',
    mode: 'curve',
    opacity: 0.6,
    shadow: 30,
    startHead: 'circle',
    variant: 'standard',
    width: 6,
  })),
  isArrowObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'arrow'),
  isBlurObjectMock: vi.fn(() => false),
  isGroupMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  parseColorForStoreMock: vi.fn((value: unknown, fallback: string) =>
    value == null || value === '' ? fallback : `parsed:${String(value)}`
  ),
  updateSelectionArrowSettingsMock: vi.fn(),
  updateSelectionBlurSettingsMock: vi.fn(),
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
      updateSelectionBlurSettings: mocks.updateSelectionBlurSettingsMock,
      updateSelectionBrushSettings: mocks.updateSelectionBrushSettingsMock,
      updateSelectionShapeSettings: mocks.updateSelectionShapeSettingsMock,
      updateSelectionStepSettings: mocks.updateSelectionStepSettingsMock,
      updateSelectionTextSettings: mocks.updateSelectionTextSettingsMock,
    }),
  },
}));
vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isGroup: mocks.isGroupMock,
  isTextbox: mocks.isTextboxMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));
vi.mock('../../objects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects')>()),
  normalizeTextLayoutMode: (value: unknown) => (value === 'auto' ? 'auto' : 'fixed-width'),
  normalizeTextCalloutFormat: (value: unknown) => (value === 'plain' ? 'plain' : 'bubble'),
}));
vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  getBlurSettings: vi.fn(() => ({ amount: 18, blurType: 'solid' as const, showBorder: true })),
  isBlurObject: mocks.isBlurObjectMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowSettings: mocks.getArrowSettingsMock,
  isArrowObject: mocks.isArrowObjectMock,
}));

import { Rect } from 'fabric';
import { syncSelectionToolSettingsFromObject } from './sync';

function registerBrushSyncTest() {
  it('syncs brush settings with parsed color and smoothing fallbacks', () => {
    syncSelectionToolSettingsFromObject(
      {
        opacity: 0.6,
        stroke: '#123456',
        strokeWidth: 9,
      } as never,
      'pencil'
    );

    expect(mocks.updateSelectionBrushSettingsMock).toHaveBeenCalledWith(
      'pencil',
      expect.objectContaining({
        color: 'parsed:#123456',
        opacity: 0.6,
        smoothingLevel: 4,
        width: 9,
      })
    );
  });
}

function registerShapeSyncTest() {
  it('syncs shape settings including fill, opacity, radius, and shadow', () => {
    syncSelectionToolSettingsFromObject(
      new Rect({
        fill: '#00ff00',
        sniptaleBorderPresetId: 'preset-shape',
        sniptaleShapeFillOpacity: 0.35,
        sniptaleShapeShadow: 100,
        sniptaleShapeStrokeOpacity: 0.75,
        sniptaleShapeStrokeStyle: 'dashed',
        rx: 12,
        stroke: '#ff00ff',
        strokeWidth: 5,
      }) as never,
      'rectangle'
    );

    expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenCalledWith(
      'rectangle',
      expect.objectContaining({
        borderPresetId: 'preset-shape',
        fillColor: 'parsed:#00ff00',
        fillOpacity: 0.35,
        opacity: 0.75,
        radius: 12,
        shadow: 100,
        strokeColor: 'parsed:#ff00ff',
        strokeOpacity: 0.75,
        strokeStyle: 'dashed',
        strokeWidth: 5,
      })
    );
  });

  it('falls back to stored radius for non-rect shape objects', () => {
    syncSelectionToolSettingsFromObject(
      {
        fill: '#00aa00',
        stroke: '#111111',
      } as never,
      'ellipse'
    );

    expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenCalledWith(
      'ellipse',
      expect.objectContaining({ radius: 8 })
    );
  });
}

function registerArrowSyncTest() {
  it('syncs arrow settings through the arrow owner seam', () => {
    syncSelectionToolSettingsFromObject({ kind: 'arrow' } as never, 'arrow');

    expect(mocks.getArrowSettingsMock).toHaveBeenCalled();
    expect(mocks.updateSelectionArrowSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: '#f60',
        endHead: 'open',
        mode: 'curve',
        opacity: 0.6,
        shadow: 30,
        startHead: 'circle',
        variant: 'standard',
        width: 6,
      })
    );
  });
}

describe('editor-controller selection sync brush-shape-arrow coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerBrushSyncTest();
  registerShapeSyncTest();
  registerArrowSyncTest();
});
