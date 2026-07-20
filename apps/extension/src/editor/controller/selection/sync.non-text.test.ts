import { beforeEach, describe, expect, it, vi } from 'vitest';

const shapeSettings = vi.hoisted(() => ({
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
}));

const textSettings = vi.hoisted(() => ({
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
  textColor: '#222222',
}));

const selectionToolSettings = vi.hoisted(() => {
  return {
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
    pencil: { color: '#ff0000', opacity: 1, shadow: 0, smoothingLevel: 4, width: 4 },
    rectangle: shapeSettings,
    ellipse: shapeSettings,
    diamond: shapeSettings,
    step: { alphabet: 'latin', color: '#222222', sizeLevel: 'md', type: 'number', value: '1' },
    text: textSettings,
  };
});

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
  isGroupMock: vi.fn((object: { kind?: string }) => object.kind === 'group'),
  isTextboxMock: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
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
vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal()),
  isGroup: mocks.isGroupMock,
  isTextbox: mocks.isTextboxMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));
vi.mock('../../objects', async (importOriginal) => ({
  ...(await importOriginal()),
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
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowSettings: mocks.getArrowSettingsMock,
  isArrowObject: mocks.isArrowObjectMock,
}));

import { syncSelectionToolSettingsFromObject } from './sync';

function registerBrushSyncTest() {
  it('syncs brush selections through their owner-specific fallbacks', () => {
    syncSelectionToolSettingsFromObject(
      {
        kind: 'pencil',
        sniptaleBrushShadow: 100,
        opacity: 0.5,
        stroke: '#123456',
        strokeWidth: 9,
      } as never,
      'pencil'
    );
    syncSelectionToolSettingsFromObject(
      {
        fill: '#abcdef',
        kind: 'shape',
        sniptaleBorderPresetId: 'preset-1',
        sniptaleShapeFillOpacity: 0.25,
        sniptaleShapeRadius: 14,
        sniptaleShapeShadow: 100,
        sniptaleShapeStrokeOpacity: 0.75,
        sniptaleShapeStrokeStyle: 'dashed',
        rx: 10,
        stroke: '#111111',
        strokeWidth: 6,
      } as never,
      'rectangle'
    );

    expect(mocks.updateSelectionBrushSettingsMock).toHaveBeenCalledWith(
      'pencil',
      expect.objectContaining({
        color: 'parsed:#123456',
        opacity: 0.5,
        shadow: 100,
        width: 9,
      })
    );
  });
}

function registerShapeSyncTest() {
  it('syncs shape selections through their owner-specific fallbacks', () => {
    syncSelectionToolSettingsFromObject(
      {
        fill: '#abcdef',
        kind: 'shape',
        sniptaleBorderPresetId: 'preset-1',
        sniptaleShapeFillOpacity: 0.25,
        sniptaleShapeRadius: 14,
        sniptaleShapeShadow: 100,
        sniptaleShapeStrokeOpacity: 0.75,
        sniptaleShapeStrokeStyle: 'dashed',
        rx: 10,
        stroke: '#111111',
        strokeWidth: 6,
      } as never,
      'rectangle'
    );

    expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenCalledWith(
      'rectangle',
      expect.objectContaining({
        borderPresetId: 'preset-1',
        fillColor: 'parsed:#abcdef',
        fillOpacity: 0.25,
        opacity: 0.75,
        radius: 8,
        shadow: 100,
        strokeColor: 'parsed:#111111',
        strokeOpacity: 0.75,
        strokeStyle: 'dashed',
        strokeWidth: 6,
      })
    );
  });
}

function registerArrowSyncTest() {
  it('syncs arrow settings into the editor store', () => {
    syncSelectionToolSettingsFromObject({ kind: 'arrow' } as never, 'arrow');

    expect(mocks.updateSelectionArrowSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: '#f60',
        endHead: 'open',
        mode: 'curve',
        shadow: 30,
        width: 6,
      })
    );
  });
}

function registerStepFallbackTest() {
  it('keeps step color fallback when the group has no circle child', () => {
    syncSelectionToolSettingsFromObject(
      {
        getObjects: () => [],
        kind: 'group',
        sniptaleStepValue: '3',
      } as never,
      'step'
    );

    expect(mocks.updateSelectionStepSettingsMock).toHaveBeenCalledOnce();
  });
}

function registerGuardTest() {
  it('skips incompatible non-text sync branches explicitly', () => {
    syncSelectionToolSettingsFromObject({ kind: 'other' } as never, 'text');
    syncSelectionToolSettingsFromObject({ kind: 'other' } as never, 'arrow');
    syncSelectionToolSettingsFromObject({ kind: 'other' } as never, 'image' as never);
    syncSelectionToolSettingsFromObject({ kind: 'other' } as never, 'browser-frame' as never);
    syncSelectionToolSettingsFromObject({ kind: 'other' } as never, 'background' as never);
    syncSelectionToolSettingsFromObject({ kind: 'other' } as never, 'transparent-base' as never);
    syncSelectionToolSettingsFromObject({ kind: 'other' } as never, 'source-image' as never);

    expect(mocks.updateSelectionTextSettingsMock).not.toHaveBeenCalled();
    expect(mocks.updateSelectionBrushSettingsMock).not.toHaveBeenCalled();
    expect(mocks.updateSelectionShapeSettingsMock).not.toHaveBeenCalled();
    expect(mocks.updateSelectionArrowSettingsMock).not.toHaveBeenCalled();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('editor-controller selection sync non-text object seams', () => {
  registerBrushSyncTest();
  registerShapeSyncTest();
  registerArrowSyncTest();
});

describe('editor-controller selection sync non-text guard seams', () => {
  registerStepFallbackTest();
  registerGuardTest();
});
