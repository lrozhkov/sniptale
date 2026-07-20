import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectionToolSettings = {
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
  highlighter: { color: '#ffee00', opacity: 0.3, shadow: 0, width: 12 },
  pencil: { color: '#ff0000', opacity: 1, shadow: 0, width: 4 },
  ellipse: {
    borderPresetId: null,
    customCss: '',
    fillColor: '#eeeeee',
    fillOpacity: 0.5,
    inheritCustomCss: false,
    opacity: 0.6,
    radius: 4,
    shadow: 20,
    strokeColor: '#111111',
    strokeOpacity: 0.7,
    strokeStyle: 'solid',
    strokeWidth: 1,
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
  step: { alphabet: 'latin', color: '#222222', sizeLevel: 'md', type: 'number', value: '1' },
  text: {
    backgroundColor: '#eeeeee',
    backgroundOpacity: 1,
    calloutFormat: 'panel',
    fontFamily: 'sans',
    fontSize: 18,
    fontWeight: 'bold',
    fontStyle: 'normal',
    underline: false,
    linethrough: false,
    shadow: 0,
    textColor: '#222222',
  },
};

const mocks = vi.hoisted(() => ({
  isArrowObjectMock: vi.fn(() => false),
  isGroupMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  parseColorForStoreMock: vi.fn((value: unknown, fallback: string) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'transparent' ||
      normalized === 'none' ||
      normalized === 'rgba(255, 204, 0, 0)' ||
      normalized === '#abcdef00'
    ) {
      return 'transparent';
    }

    return `parsed:${normalized}`;
  }),
  updateSelectionShapeSettingsMock: vi.fn(),
}));

vi.mock('fabric', () => ({
  Path: class Path {
    constructor(public path: Array<Array<string | number>> = []) {}
  },
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
      updateSelectionArrowSettings: vi.fn(),
      updateSelectionBrushSettings: vi.fn(),
      updateSelectionShapeSettings: mocks.updateSelectionShapeSettingsMock,
      updateSelectionStepSettings: vi.fn(),
      updateSelectionTextSettings: vi.fn(),
    }),
  },
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal()),
  isGroup: mocks.isGroupMock,
  isTextbox: mocks.isTextboxMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));

vi.mock('../../objects', async (importOriginal) => ({
  ...(await importOriginal()),
  getArrowSettings: vi.fn(),
  isArrowObject: mocks.isArrowObjectMock,
  normalizeTextCalloutFormat: vi.fn(),
}));

import { Rect } from 'fabric';
import { resolveShapeFillColor, resolveShapeStrokeColor } from './shape-fill';
import { syncSelectionToolSettingsFromObject } from './sync';

function expectLatestShapeSettings(values: Record<string, unknown>) {
  expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenLastCalledWith(
    'rectangle',
    expect.objectContaining(values)
  );
}

function registerShapeFillHelperTests() {
  it('uses the global parser for visible fills and for empty values', () => {
    expect(resolveShapeFillColor('rgb(1, 2, 3)', 0.6, '#112233')).toBe('parsed:rgb(1, 2, 3)');
    expect(resolveShapeFillColor('', 0, '#112233')).toBe('#112233');
  });

  it('preserves hidden zero-opacity colors and falls back when the parsed value is unusable', () => {
    expect(resolveShapeFillColor('rgba(255, 204, 0, 0)', 0, '#112233')).toBe('#ffcc00');
    expect(resolveShapeFillColor('#abcdef00', 0, '#112233')).toBe('#abcdef');
    expect(resolveShapeStrokeColor('rgba(255, 204, 0, 0)', 0, '#112233')).toBe('#ffcc00');
    expect(resolveShapeStrokeColor('#abcdef00', 0, '#112233')).toBe('#abcdef');

    mocks.parseColorForStoreMock.mockReturnValueOnce('transparent');
    expect(resolveShapeFillColor('masked-transparent', 0, '#112233')).toBe('#112233');
    expect(resolveShapeFillColor('brand-token', 0, '#112233')).toBe('parsed:brand-token');
    expect(resolveShapeStrokeColor('transparent', 0, '#112233')).toBe('transparent');
  });
}

function registerShapeFillPreservationTests() {
  it('preserves the hidden fill color when zero fill opacity renders rgba alpha zero', () => {
    syncSelectionToolSettingsFromObject(
      new Rect({
        fill: 'rgba(255, 204, 0, 0)',
        sniptaleShapeFillOpacity: 0,
      }) as never,
      'rectangle'
    );

    expectLatestShapeSettings({ fillColor: '#ffcc00', fillOpacity: 0 });
  });

  it('preserves the hidden hex fill color when zero fill opacity renders 8-digit hex', () => {
    syncSelectionToolSettingsFromObject(
      new Rect({
        fill: '#abcdef00',
        sniptaleShapeFillOpacity: 0,
      }) as never,
      'rectangle'
    );

    expectLatestShapeSettings({ fillColor: '#abcdef', fillOpacity: 0 });
  });
}

function registerShapeStrokePreservationTests() {
  it('keeps explicit transparent fills transparent by intent', () => {
    syncSelectionToolSettingsFromObject(
      new Rect({
        fill: 'transparent',
        sniptaleShapeFillOpacity: 0,
      }) as never,
      'rectangle'
    );

    expectLatestShapeSettings({ fillColor: 'transparent', fillOpacity: 0 });
  });

  it('preserves the hidden stroke color when zero stroke opacity renders rgba alpha zero', () => {
    syncSelectionToolSettingsFromObject(
      new Rect({
        stroke: 'rgba(255, 204, 0, 0)',
        sniptaleShapeStrokeOpacity: 0,
      }) as never,
      'rectangle'
    );

    expectLatestShapeSettings({
      opacity: 0,
      strokeColor: '#ffcc00',
      strokeOpacity: 0,
    });
  });
}

function registerShapeFillOpacityFallbackTests() {
  it('ignores baked object opacity when shape opacity metadata is absent', () => {
    syncSelectionToolSettingsFromObject(
      new Rect({
        fill: '#ffcc00',
        opacity: 0.25,
      }) as never,
      'rectangle'
    );

    expectLatestShapeSettings({
      fillColor: 'parsed:#ffcc00',
      fillOpacity: 1,
      opacity: 1,
      strokeOpacity: 1,
    });
  });

  it('falls back to current store opacity values when object opacity metadata is absent', () => {
    syncSelectionToolSettingsFromObject(
      new Rect({
        fill: '#ffcc00',
      }) as never,
      'rectangle'
    );

    expectLatestShapeSettings({
      fillColor: 'parsed:#ffcc00',
      fillOpacity: 1,
      opacity: 1,
      strokeOpacity: 1,
    });
  });
}

function runShapeFillOpacitySuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerShapeFillHelperTests();
  registerShapeFillPreservationTests();
  registerShapeStrokePreservationTests();
  registerShapeFillOpacityFallbackTests();
}

describe('editor-controller selection shape fill opacity sync', runShapeFillOpacitySuite);
