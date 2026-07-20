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

function createTextSettings() {
  return {
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
  highlighter: { color: '#ffee00', opacity: 0.3, shadow: 0, smoothingLevel: 4, width: 12 },
  blur: { amount: 12, blurType: 'gaussian' as const, showBorder: false },
  pencil: { color: '#ff0000', opacity: 1, shadow: 0, smoothingLevel: 4, width: 4 },
  rectangle: createShapeSettings(),
  ellipse: createShapeSettings(),
  diamond: createShapeSettings(),
  step: {
    alphabet: 'latin',
    color: '#222222',
    opacity: 1,
    sizeLevel: 'md',
    strokeColor: '#f8fafc',
    strokeOpacity: 1,
    strokeWidth: 2,
    textColor: '#ffffff',
    type: 'number',
    value: '1',
  },
  text: createTextSettings(),
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
  getBlurSettingsMock: vi.fn(() => ({
    amount: 18,
    blurType: 'solid' as const,
    showBorder: true,
  })),
  isBlurObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'blur'),
  isArrowObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'arrow'),
  isGroupMock: vi.fn((object: { kind?: string }) => object.kind === 'group'),
  isTextboxMock: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
  parseColorForStoreMock: vi.fn((value: unknown, fallback: string) => {
    return value == null || value === '' ? fallback : `parsed:${String(value)}`;
  }),
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
  getArrowSettings: mocks.getArrowSettingsMock,
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
  getBlurSettings: mocks.getBlurSettingsMock,
  isBlurObject: mocks.isBlurObjectMock,
}));

import { syncSelectionToolSettingsFromObject } from './sync';

function registerTextSyncTest() {
  it('syncs text settings into the editor store', () => {
    syncSelectionToolSettingsFromObject(
      {
        backgroundColor: '#fafafa',
        fill: '#111111',
        fontFamily: 'Georgia, serif',
        fontSize: 24,
        fontWeight: 'normal',
        fontStyle: 'italic',
        underline: true,
        linethrough: true,
        kind: 'textbox',
        sniptaleTextBackgroundOpacity: 0.4,
        sniptaleTextCalloutFormat: 'ribbon',
        sniptaleTextCalloutShadow: 100,
        sniptaleTextLayoutMode: 'auto',
        sniptaleTextVerticalAlign: 'bottom',
        textAlign: 'right',
        width: 320,
      } as never,
      'text'
    );

    expect(mocks.updateSelectionTextSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: 'parsed:#fafafa',
        backgroundOpacity: 0.4,
        calloutFormat: 'bubble',
        layoutMode: 'auto',
        fontStyle: 'italic',
        shadow: 100,
        textAlign: 'right',
        verticalAlign: 'bottom',
        underline: true,
        linethrough: true,
      })
    );
    expect(mocks.updateSelectionTextSettingsMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ maxWidth: 320 })
    );
  });
}
function registerMetaStampSyncTest() {
  it('routes meta-stamp selections through the same text sync seam', () => {
    syncSelectionToolSettingsFromObject(
      {
        fill: '#222222',
        fontSize: 18,
        kind: 'textbox',
        sniptaleTextLayoutMode: 'fixed-width',
        textAlign: 'center',
      } as never,
      'meta-stamp'
    );

    expect(mocks.updateSelectionTextSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fontSize: 18,
        layoutMode: 'fixed-width',
        textAlign: 'center',
        verticalAlign: 'top',
        textColor: 'parsed:#222222',
      })
    );
  });

  it('falls back to sans when the text font family is neither serif nor mono', () => {
    syncSelectionToolSettingsFromObject(
      { fontFamily: 'Display' as const, kind: 'textbox' } as never,
      'text'
    );

    expect(mocks.updateSelectionTextSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ fontFamily: 'sans' })
    );
  });
}
function registerTextAndStepSyncTests() {
  registerTextSyncTest();
  registerMetaStampSyncTest();
}
function registerBlurSyncTest() {
  it('syncs blur settings into the editor store', () => {
    syncSelectionToolSettingsFromObject({ kind: 'blur' } as never, 'blur');

    expect(mocks.updateSelectionBlurSettingsMock).toHaveBeenCalledWith({
      amount: 18,
      blurType: 'solid',
      showBorder: true,
    });
  });
}
function registerNoopSelectionSyncTest() {
  it('skips non-configurable selection types without mutating the store', () => {
    syncSelectionToolSettingsFromObject({ kind: 'image' } as never, 'image');

    expect(mocks.updateSelectionArrowSettingsMock).not.toHaveBeenCalled();
    expect(mocks.updateSelectionBlurSettingsMock).not.toHaveBeenCalled();
    expect(mocks.updateSelectionTextSettingsMock).not.toHaveBeenCalled();
  });
}
function runSyncSelectionSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerTextAndStepSyncTests();
  registerBlurSyncTest();
  registerNoopSelectionSyncTest();
}

describe('editor-controller selection sync seam', runSyncSelectionSuite);
