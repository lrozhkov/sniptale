/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';
const fabricMock = vi.hoisted(() => ({
  Path: class Path {
    constructor(public path: Array<Array<string | number>> = []) {}
  },
  PencilBrush: class PencilBrush {},
  Point: class Point {},
  Rect: class Rect {
    fill?: string;
    opacity?: number;
    sniptaleShapeStrokeOpacity?: number;
    rx?: number;
    stroke?: string;
    strokeWidth?: number;
    sniptaleBorderPresetId?: string | null;
    sniptaleShapeShadow?: number;
    sniptaleShapeStrokeStyle?: string;
  },
}));
vi.mock('fabric', () => fabricMock);
const storeState = {
  selectionToolSettings: {
    arrow: {
      color: '#222222',
      endHead: 'block',
      mode: 'curve',
      opacity: 0.6,
      startHead: 'none',
      variant: 'standard',
      width: 4,
    },
    highlighter: { color: '#ff0', opacity: 0.4, width: 12 },
    pencil: { color: '#000', opacity: 1, width: 2 },
    ellipse: {
      borderPresetId: null,
      fillColor: '#eee',
      opacity: 0.5,
      radius: 6,
      shadow: 10,
      strokeColor: '#222',
      strokeOpacity: 0.8,
      strokeStyle: 'dashed',
      strokeWidth: 4,
    },
    rectangle: {
      borderPresetId: null,
      fillColor: '#fff',
      opacity: 0.7,
      radius: 8,
      shadow: 30,
      strokeColor: '#111',
      strokeOpacity: 1,
      strokeStyle: 'solid',
      strokeWidth: 3,
    },
    step: { alphabet: 'latin', color: '#123123', sizeLevel: 'm', type: 'numeric', value: '4' },
    text: {
      backgroundColor: '#fff',
      backgroundOpacity: 1,
      calloutFormat: 'panel',
      fontFamily: 'serif',
      fontSize: 18,
      fontWeight: 'bold',
      fontStyle: 'normal',
      layoutMode: 'fixed-width',
      underline: false,
      linethrough: false,
      textAlign: 'left',
      verticalAlign: 'top',
      textColor: '#222',
    },
  },
  updateSelectionArrowSettings: vi.fn(),
  updateSelectionBrushSettings: vi.fn(),
  updateSelectionShapeSettings: vi.fn(),
  updateSelectionStepSettings: vi.fn(),
  updateSelectionTextSettings: vi.fn(),
};
const mocks = vi.hoisted(() => ({
  applyShapeSettingsMock: vi.fn(),
  getArrowSettingsMock: vi.fn(() => ({
    color: '#777',
    endHead: 'block',
    mode: 'curve',
    opacity: 0.5,
    startHead: 'none',
    variant: 'standard',
    width: 6,
  })),
  isArrowObjectMock: vi.fn(() => false),
  isGroupMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  parseColorForStoreMock: vi.fn((value: string | null | undefined) => value ?? '#fallback'),
  storeGetStateMock: vi.fn(() => storeState),
  updateArrowObjectMock: vi.fn(),
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: mocks.storeGetStateMock,
  },
}));
vi.mock('../core/helpers', async () => ({
  ...(await vi.importActual<typeof import('../core/helpers')>('../core/helpers')),
  isGroup: mocks.isGroupMock,
  isTextbox: mocks.isTextboxMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));
vi.mock('../../objects/annotation/text/callout/lifecycle', () => ({
  applyTextCalloutRendering: vi.fn(),
}));
vi.mock('../../objects/annotation/text/callout/format', () => ({
  getTextCalloutBackgroundColor: (settings: { backgroundColor: string; calloutFormat: string }) =>
    settings.calloutFormat === 'plain' ? '' : settings.backgroundColor,
  getTextCalloutPadding: (format: string) => (format === 'plain' ? 0 : 10),
  normalizeTextCalloutFormat: (value: unknown) => value ?? 'bubble',
  normalizeTextLayoutMode: (value: unknown) => (value === 'auto' ? 'auto' : 'fixed-width'),
  resolveTextCalloutFormat: vi.fn(),
}));
vi.mock('../../objects/annotation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation')>()),
  updateStepGroup: (group: { getObjects: () => Array<{ set: (value: unknown) => void }> }) => {
    const [circle, number] = group.getObjects();
    circle?.set({ fill: storeState.selectionToolSettings.step.color });
    number?.set({ text: storeState.selectionToolSettings.step.value });
  },
}));
vi.mock('../../objects/shape-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/shape-style')>()),
  applyShapeSettings: mocks.applyShapeSettingsMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowSettings: mocks.getArrowSettingsMock,
  isArrowObject: mocks.isArrowObjectMock,
  updateArrowObject: mocks.updateArrowObjectMock,
}));
vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  TRANSPARENT_COLOR: 'transparent',
  clamp: (value: number, min: number, max: number) => Math.min(Math.max(value, min), max),
  fontFamilyToCss: (value: string) => `css-${value}`,
  hexToRgba: (value: string) => `${value}-rgba`,
}));
import { applySelectionToolSettingsToObjects } from './apply/dispatch';
import { createTextSelectionObject } from './coverage.test-support';
import { syncSelectionToolSettingsFromObject } from './sync/dispatch';
describe('editor selection apply/sync seams', () => {
  it('applies tool settings across selection object types', () => {
    const brush = { set: vi.fn() };
    applySelectionToolSettingsToObjects(
      [brush] as never,
      'pencil' as never,
      storeState.selectionToolSettings as never
    );
    expect(brush.set).toHaveBeenCalledWith(expect.objectContaining({ stroke: '#000-rgba' }));
    const shape = {};
    applySelectionToolSettingsToObjects(
      [shape] as never,
      'rectangle' as never,
      storeState.selectionToolSettings as never
    );
    expect(mocks.applyShapeSettingsMock).toHaveBeenCalledWith(
      shape,
      'rectangle',
      storeState.selectionToolSettings.rectangle
    );
    const text = { set: vi.fn() };
    mocks.isTextboxMock.mockReturnValueOnce(true);
    applySelectionToolSettingsToObjects(
      [text] as never,
      'text' as never,
      storeState.selectionToolSettings as never
    );
    expect(text.set).toHaveBeenCalledWith(expect.objectContaining({ fontFamily: 'css-serif' }));

    const metaStamp = { set: vi.fn() };
    mocks.isTextboxMock.mockReturnValueOnce(true);
    applySelectionToolSettingsToObjects(
      [metaStamp] as never,
      'meta-stamp' as never,
      storeState.selectionToolSettings as never
    );
    expect(metaStamp.set).toHaveBeenCalledWith(
      expect.objectContaining({ fontFamily: 'css-serif' })
    );

    const circle = { set: vi.fn() };
    const number = { set: vi.fn() };
    const step = { getObjects: () => [circle, number] };
    mocks.isGroupMock.mockReturnValueOnce(true);
    applySelectionToolSettingsToObjects(
      [step] as never,
      'step' as never,
      storeState.selectionToolSettings as never
    );
    expect(circle.set).toHaveBeenCalledWith({ fill: '#123123' });
    expect(number.set).toHaveBeenCalledWith({ text: '4' });

    const arrow = {};
    mocks.isArrowObjectMock.mockReturnValueOnce(true);
    applySelectionToolSettingsToObjects(
      [arrow] as never,
      'arrow' as never,
      storeState.selectionToolSettings as never
    );
    expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(arrow, {
      settings: storeState.selectionToolSettings.arrow,
    });
  });
  it('syncs selection settings back into the store for each supported type', () => {
    syncSelectionToolSettingsFromObject(
      {
        fill: '#202020',
        sniptaleBrushDynamicWidth: true,
        sniptaleBrushWidth: 9,
        opacity: 0.5,
      } as never,
      'highlighter' as never
    );
    expect(storeState.updateSelectionBrushSettings).toHaveBeenCalledWith(
      'highlighter',
      expect.objectContaining({ color: '#202020', dynamicWidth: true, width: 9 })
    );

    const shape = new fabricMock.Rect();
    shape.fill = '#fafafa';
    shape.opacity = 0.7;
    shape.rx = 9;
    shape.stroke = '#111111';
    shape.strokeWidth = 2;
    syncSelectionToolSettingsFromObject(shape as never, 'rectangle' as never);
    expect(storeState.updateSelectionShapeSettings).toHaveBeenCalledWith(
      'rectangle',
      expect.objectContaining({ radius: 9 })
    );

    const hiddenStrokeShape = new fabricMock.Rect();
    hiddenStrokeShape.stroke = 'rgba(255, 204, 0, 0)';
    hiddenStrokeShape.sniptaleShapeStrokeOpacity = 0;
    syncSelectionToolSettingsFromObject(hiddenStrokeShape as never, 'rectangle' as never);
    expect(storeState.updateSelectionShapeSettings).toHaveBeenCalledWith(
      'rectangle',
      expect.objectContaining({ opacity: 0, strokeColor: '#ffcc00', strokeOpacity: 0 })
    );

    const text = createTextSelectionObject('text');
    mocks.isTextboxMock.mockReturnValueOnce(true);
    syncSelectionToolSettingsFromObject(text as never, 'text' as never);
    expect(storeState.updateSelectionTextSettings).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundOpacity: 0.5, verticalAlign: 'bottom' })
    );
    expect(storeState.updateSelectionTextSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ maxWidth: 180 })
    );

    const metaStamp = createTextSelectionObject('meta-stamp');
    mocks.isTextboxMock.mockReturnValueOnce(true);
    syncSelectionToolSettingsFromObject(metaStamp as never, 'meta-stamp' as never);
    expect(storeState.updateSelectionTextSettings).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundOpacity: 0.25, verticalAlign: 'top' })
    );
    const circle = { fill: '#abcd' };
    const step = {
      getObjects: () => [circle],
      sniptaleStepAlphabet: 'latin',
      sniptaleStepSizeLevel: 'l',
      sniptaleStepType: 'alpha',
      sniptaleStepValue: 'A',
    };
    mocks.isGroupMock.mockReturnValueOnce(true);
    syncSelectionToolSettingsFromObject(step as never, 'step' as never);
    expect(storeState.updateSelectionStepSettings).toHaveBeenCalled();
    const arrow = {};
    mocks.isArrowObjectMock.mockReturnValueOnce(true);
    syncSelectionToolSettingsFromObject(arrow as never, 'arrow' as never);
    expect(storeState.updateSelectionArrowSettings).toHaveBeenCalledWith(
      expect.objectContaining({ endHead: 'block', width: 6 })
    );
    syncSelectionToolSettingsFromObject({} as never, 'transparent-base' as never);
    syncSelectionToolSettingsFromObject({} as never, 'background' as never);
    syncSelectionToolSettingsFromObject({} as never, 'image' as never);
    syncSelectionToolSettingsFromObject({} as never, 'source-image' as never);
    syncSelectionToolSettingsFromObject({} as never, 'browser-frame' as never);
  });
});
