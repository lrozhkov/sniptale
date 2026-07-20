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
  highlighter: { color: '#ffee00', opacity: 0.3, shadow: 0, smoothingLevel: 4, width: 12 },
  blur: { amount: 12, blurType: 'gaussian' as const, showBorder: false },
  pencil: { color: '#ff0000', opacity: 1, shadow: 0, smoothingLevel: 4, width: 4 },
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
  ellipse: {
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
  diamond: {
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
    layoutMode: 'fixed-width',
    fontFamily: 'sans',
    fontSize: 18,
    fontWeight: 'bold',
    fontStyle: 'normal',
    underline: false,
    linethrough: false,
    shadow: 0,
    textAlign: 'left',
    verticalAlign: 'top',
    textColor: '#222222',
  },
};

const mocks = vi.hoisted(() => ({
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  isGroupMock: vi.fn(() => false),
  isTextboxMock: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
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
  Rect: class Rect {},
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
  getArrowSettings: vi.fn(),
  isArrowObject: mocks.isArrowObjectMock,
  normalizeTextLayoutMode: (value: unknown) => (value === 'auto' ? 'auto' : 'fixed-width'),
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
vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  getBlurSettings: vi.fn(),
  isBlurObject: mocks.isBlurObjectMock,
}));

import { syncSelectionToolSettingsFromObject } from './sync';

function registerFallbackTextDefaultsTest() {
  it('falls back to canonical text defaults when textbox metadata is incomplete', () => {
    syncSelectionToolSettingsFromObject(
      {
        backgroundColor: '',
        fill: null,
        fontFamily: 'System UI',
        kind: 'textbox',
        sniptaleTextBackgroundOpacity: 2,
        sniptaleTextCalloutFormat: 'panel',
        sniptaleTextVerticalAlign: 'unexpected',
        textAlign: 'justify',
      } as never,
      'text'
    );

    expect(mocks.updateSelectionTextSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: 'transparent',
        backgroundOpacity: 1,
        fontFamily: 'sans',
        textAlign: 'left',
        textColor: '#222222',
        verticalAlign: 'top',
      })
    );
  });
}

function registerStoredTypographyDefaultsTest() {
  it('reuses stored typography defaults when text metadata is absent', () => {
    syncSelectionToolSettingsFromObject(
      {
        fontFamily: 'ui-monospace',
        kind: 'textbox',
        sniptaleTextCalloutFormat: 'bubble',
      } as never,
      'text'
    );

    expect(mocks.updateSelectionTextSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fontFamily: 'mono',
        fontSize: 18,
        fontStyle: 'normal',
        fontWeight: 'bold',
        layoutMode: 'fixed-width',
        linethrough: false,
        shadow: 0,
        underline: false,
      })
    );
  });
}

describe('editor-controller selection sync text defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerFallbackTextDefaultsTest();
  registerStoredTypographyDefaultsTest();
});
