import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyFreehandSettingsMock: vi.fn(),
  applyShapeSettingsMock: vi.fn(),
  applyTextCalloutRenderingMock: vi.fn(),
  applyTextLayoutMock: vi.fn(),
  getArrowSettingsMock: vi.fn(() => ({ color: '#333333', width: 5 })),
  getBlurSettingsMock: vi.fn(() => ({ amount: 12 })),
  getLineSettingsMock: vi.fn(() => ({ color: '#123456', width: 5 })),
  getTextCalloutBackgroundColorMock: vi.fn(() => '#ffffff'),
  getTextCalloutPaddingMock: vi.fn(() => 12),
  isArrowObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'arrow'),
  isBlurObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'blur'),
  isGroupMock: vi.fn((object: { kind?: string }) => object.kind === 'group'),
  isLineObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'line'),
  isTextboxMock: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
  updateArrowObjectMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
  updateLineObjectMock: vi.fn(),
  updateRichShapeObjectStyleMock: vi.fn(),
  updateSelectionArrowSettingsMock: vi.fn(),
  updateSelectionBlurSettingsMock: vi.fn(),
  updateSelectionBrushSettingsMock: vi.fn(),
  updateSelectionLineSettingsMock: vi.fn(),
  updateSelectionShapeSettingsMock: vi.fn(),
  updateSelectionStepSettingsMock: vi.fn(),
  updateSelectionTextSettingsMock: vi.fn(),
  updateStepGroupMock: vi.fn(),
  readFreehandColorInputMock: vi.fn(() => '#aa5500'),
  readFreehandDynamicWidthMock: vi.fn(() => true),
  readFreehandSmoothingLevelMock: vi.fn(() => 10),
  readFreehandWidthMock: vi.fn(() => 7),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: toolSettings,
      updateSelectionArrowSettings: mocks.updateSelectionArrowSettingsMock,
      updateSelectionBlurSettings: mocks.updateSelectionBlurSettingsMock,
      updateSelectionBrushSettings: mocks.updateSelectionBrushSettingsMock,
      updateSelectionLineSettings: mocks.updateSelectionLineSettingsMock,
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
}));
vi.mock('../freehand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../freehand')>()),
  applyFreehandSettingsToObject: mocks.applyFreehandSettingsMock,
  readFreehandColorInput: mocks.readFreehandColorInputMock,
  readFreehandDynamicWidth: mocks.readFreehandDynamicWidthMock,
  readFreehandSmoothingLevel: mocks.readFreehandSmoothingLevelMock,
  readFreehandWidth: mocks.readFreehandWidthMock,
}));
vi.mock('../../objects/annotation/text/layout/apply', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/layout/apply')>()),
  applyTextLayout: mocks.applyTextLayoutMock,
}));
vi.mock('../../objects/annotation/text/callout/lifecycle', () => ({
  applyTextCalloutRendering: mocks.applyTextCalloutRenderingMock,
}));
vi.mock('../../objects/annotation/text/callout/format', () => ({
  getTextCalloutBackgroundColor: mocks.getTextCalloutBackgroundColorMock,
  getTextCalloutPadding: mocks.getTextCalloutPaddingMock,
  resolveTextCalloutFormat: vi.fn(),
}));
vi.mock('../../objects/annotation/blur/object/settings', () => ({
  getBlurSettings: mocks.getBlurSettingsMock,
}));
vi.mock('../../objects/annotation/blur/object/identity', () => ({
  isBlurObject: mocks.isBlurObjectMock,
}));
vi.mock('../../objects/annotation/blur/object/update', () => ({
  updateBlurObject: mocks.updateBlurObjectMock,
}));
vi.mock('../../objects/annotation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation')>()),
  updateStepGroup: mocks.updateStepGroupMock,
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
vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  getLineSettings: mocks.getLineSettingsMock,
  isLineObject: mocks.isLineObjectMock,
  updateLineObject: mocks.updateLineObjectMock,
}));
vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  updateRichShapeObjectStyle: mocks.updateRichShapeObjectStyleMock,
}));
vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  fontFamilyToCss: (family: string) => `font:${family}`,
}));
import { applySelectionToolSettingsToObjects } from './apply/dispatch';
import { syncSelectionToolSettingsFromObject } from './sync/dispatch';
const lineSettings = {
  color: '#123456',
  corners: 'sharp',
  fillColor: '#ffffff',
  fillMode: 'none',
  fillOpacity: 0.2,
  gradientAngle: 0,
  gradientFrom: '#ffffff',
  gradientTo: '#ff671d',
  opacity: 0.7,
  roughFillAngle: -41,
  roughFillColor: '#ffffff',
  roughFillGap: 8,
  roughFillStyle: 'hachure',
  roughFillWeight: 1,
  roughFillRoughness: 1,
  roughFillBowing: 1,
  roughFillOpacity: 0.2,
  roughness: 0.5,
  style: 'dash',
  width: 5,
};
const toolSettings = {
  arrow: { color: '#333333', width: 5 },
  blur: { amount: 12 },
  highlighter: { color: '#ffee00', dynamicWidth: true, opacity: 0.4, smoothingLevel: 6, width: 9 },
  line: lineSettings,
  pencil: { color: '#111111', dynamicWidth: false, opacity: 1, smoothingLevel: 5, width: 3 },
  rectangle: {
    fillColor: '#ffffff',
    fillOpacity: 1,
    radius: 4,
    shadow: 0,
    strokeColor: '#000000',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 4,
  },
  step: { alphabet: 'latin', color: '#222222', sizeLevel: 'md', type: 'number', value: '2' },
  text: {
    backgroundOpacity: 0.5,
    calloutFormat: 'plain',
    fontFamily: 'sans',
    fontSize: 16,
    fontStyle: 'italic',
    fontWeight: 'bold',
    layoutMode: 'fit',
    linethrough: true,
    shadow: 2,
    textAlign: 'center',
    textColor: '#010203',
    underline: true,
    verticalAlign: 'middle',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('applies line settings only to line objects', () => {
  const line = { kind: 'line' };
  const ignored = { kind: 'arrow' };

  applySelectionToolSettingsToObjects([line, ignored] as never, 'line', {
    line: lineSettings,
  } as never);

  expect(mocks.updateLineObjectMock).toHaveBeenCalledWith(line, {
    settings: expect.objectContaining({ color: '#123456', style: 'dash' }),
  });
  expect(mocks.updateLineObjectMock).toHaveBeenCalledTimes(1);
});

it('routes non-line selection settings through their object owners', () => {
  const brush = { kind: 'brush' };
  const shape = { kind: 'shape' };
  const blur = { kind: 'blur' };
  const step = { kind: 'group' };
  const arrow = { kind: 'arrow' };
  const richShape = { kind: 'rich-shape' };

  applySelectionToolSettingsToObjects([brush] as never, 'pencil', toolSettings as never);
  applySelectionToolSettingsToObjects([shape] as never, 'rectangle', toolSettings as never);
  applySelectionToolSettingsToObjects([blur] as never, 'blur', toolSettings as never);
  applySelectionToolSettingsToObjects([step] as never, 'step', toolSettings as never);
  applySelectionToolSettingsToObjects([arrow] as never, 'arrow', toolSettings as never);
  applySelectionToolSettingsToObjects([richShape] as never, 'rich-shape', toolSettings as never);
  applySelectionToolSettingsToObjects([shape] as never, 'background', toolSettings as never);

  expect(mocks.applyFreehandSettingsMock).toHaveBeenCalledWith(brush, toolSettings.pencil);
  expect(mocks.applyShapeSettingsMock).toHaveBeenCalledWith(
    shape,
    'rectangle',
    expect.objectContaining({ strokeWidth: 4 })
  );
  expect(mocks.updateBlurObjectMock).toHaveBeenCalledWith(blur, { settings: toolSettings.blur });
  expect(mocks.updateStepGroupMock).toHaveBeenCalledWith(step, toolSettings.step);
  expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(arrow, {
    settings: toolSettings.arrow,
  });
  expect(mocks.updateRichShapeObjectStyleMock).toHaveBeenCalledWith(richShape, toolSettings);
});

it('applies text settings only to textbox objects', () => {
  const textbox = { kind: 'textbox', set: vi.fn() };

  applySelectionToolSettingsToObjects([textbox, { kind: 'shape' }] as never, 'text', {
    ...toolSettings,
    text: toolSettings.text,
  } as never);

  expect(textbox.set).toHaveBeenCalledWith(
    expect.objectContaining({
      fill: 'rgba(1, 2, 3, 1)',
      fontFamily: 'font:sans',
      fontSize: 16,
      padding: 12,
    })
  );
  expect(mocks.applyTextLayoutMock).toHaveBeenCalledWith(textbox, { layoutMode: 'fit' });
  expect(mocks.applyTextCalloutRenderingMock).toHaveBeenCalledWith(textbox);
});

function syncBrushShapeTextAndStepSelections() {
  mocks.isTextboxMock.mockReturnValue(true);

  syncSelectionToolSettingsFromObject({ opacity: 0.5 } as never, 'pencil');
  syncSelectionToolSettingsFromObject(
    {
      fill: '#ffeeaa',
      sniptaleShapeFillOpacity: 0.5,
      sniptaleShapeStrokeOpacity: 0.75,
      stroke: '#001122',
      strokeWidth: 6,
    } as never,
    'rectangle'
  );
  syncSelectionToolSettingsFromObject(
    { fill: '#111111', fontFamily: 'Georgia', fontSize: 20 } as never,
    'text'
  );
  syncSelectionToolSettingsFromObject(
    {
      getObjects: () => [{ fill: '#445566' }],
      kind: 'group',
      sniptaleStepValue: '3',
    } as never,
    'step'
  );
}

function syncLinearAndBlurSelections() {
  syncSelectionToolSettingsFromObject({ kind: 'line' } as never, 'line');
  syncSelectionToolSettingsFromObject({ kind: 'arrow' } as never, 'arrow');
  syncSelectionToolSettingsFromObject({ kind: 'blur' } as never, 'blur');
}

it('syncs linear and blur selection settings through shared selection routing', () => {
  syncBrushShapeTextAndStepSelections();
  syncLinearAndBlurSelections();

  expect(mocks.updateSelectionLineSettingsMock).toHaveBeenCalledWith({
    color: '#123456',
    width: 5,
  });
  expect(mocks.updateSelectionArrowSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({ color: '#333333', width: 5 })
  );
  expect(mocks.updateSelectionBrushSettingsMock).toHaveBeenCalledWith(
    'pencil',
    expect.objectContaining({ dynamicWidth: true, width: 7 })
  );
  expect(mocks.updateSelectionBlurSettingsMock).toHaveBeenCalledWith({ amount: 12 });
  expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenCalledWith(
    'rectangle',
    expect.objectContaining({ strokeWidth: 6 })
  );
  expect(mocks.updateSelectionStepSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({ value: '3' })
  );
  expect(mocks.updateSelectionTextSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({ fontFamily: 'serif', fontSize: 20 })
  );
});
