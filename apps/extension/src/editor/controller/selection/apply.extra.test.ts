import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  applyShapeSettingsMock: vi.fn(),
  createFabricShadowMock: vi.fn(() => ({ blur: 10 })),
  isArrowObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'arrow'),
  isBlurObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'blur'),
  isGroupMock: vi.fn((object: { kind?: string }) => object.kind === 'group'),
  isTextboxMock: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
  updateArrowObjectMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
  updateRichShapeObjectStyleMock: vi.fn(),
}));
vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isGroup: mocks.isGroupMock,
  isTextbox: mocks.isTextboxMock,
}));
vi.mock('../../objects/shadow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/shadow')>()),
  createFabricShadow: mocks.createFabricShadowMock,
}));
vi.mock('../../objects/annotation/text/callout/lifecycle', () => ({
  applyTextCalloutRendering: vi.fn(),
}));

vi.mock('../../objects/annotation/text/callout/format', () => ({
  getTextCalloutBackgroundColor: (settings: { backgroundColor: string; calloutFormat: string }) =>
    settings.calloutFormat === 'plain' ? '' : settings.backgroundColor,
  getTextCalloutPadding: (format: string) => (format === 'plain' ? 0 : 10),
  resolveTextCalloutFormat: vi.fn(),
}));
vi.mock('../../objects/annotation/blur/object/identity', () => ({
  isBlurObject: mocks.isBlurObjectMock,
}));
vi.mock('../../objects/annotation/blur/object/update', () => ({
  updateBlurObject: mocks.updateBlurObjectMock,
}));
vi.mock('../../objects/shape-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/shape-style')>()),
  applyShapeSettings: mocks.applyShapeSettingsMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObjectMock,
  updateArrowObject: mocks.updateArrowObjectMock,
}));
vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  updateRichShapeObjectStyle: mocks.updateRichShapeObjectStyleMock,
}));
import { applySelectionToolSettingsToObjects } from './apply/dispatch';
const settings = {
  arrow: {
    color: '#111',
    endHead: 'block',
    mode: 'straight',
    opacity: 1,
    shadow: 30,
    startHead: 'none',
    variant: 'standard',
    width: 2,
  },
  blur: {
    amount: 18,
    blurType: 'solid' as const,
    showBorder: true,
  },
  highlighter: {
    color: '#ffee00',
    opacity: 0.3,
    shapeCorrection: 'off',
    shadow: 100,
    smoothingLevel: 4,
    width: 12,
  },
  pencil: {
    color: '#ff0000',
    opacity: 1,
    shapeCorrection: 'subtle',
    shadow: 30,
    smoothingLevel: 6,
    width: 4,
  },
  ellipse: {
    borderPresetId: null,
    fillColor: '#eeeeee',
    opacity: 0.5,
    radius: 6,
    shadow: 15,
    strokeColor: '#222222',
    strokeOpacity: 0.7,
    strokeStyle: 'dashed',
    strokeWidth: 5,
  },
  rectangle: {
    borderPresetId: null,
    fillColor: '#ffffff',
    opacity: 0.8,
    radius: 8,
    shadow: 30,
    strokeColor: '#000000',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 2,
  },
  step: {
    alphabet: 'latin',
    color: '#222222',
    sizeLevel: 5,
    type: 'number',
    value: '1',
  },
  text: {
    backgroundColor: '#eeeeee',
    backgroundOpacity: 0.4,
    fontSize: 18,
    fontWeight: 'bold',
    fontStyle: 'italic',
    underline: true,
    linethrough: true,
    shadow: 0,
    textColor: '#222222',
    calloutFormat: 'plain' as const,
    layoutMode: 'auto' as const,
    textAlign: 'center' as const,
    verticalAlign: 'bottom' as const,
  },
};

function registerBrushAndShapeTests() {
  it('applies brush settings to freehand objects', () => {
    const brushObject = { set: vi.fn() };

    applySelectionToolSettingsToObjects([brushObject] as never, 'pencil', settings as never);
    expect(brushObject.set).toHaveBeenCalledWith(
      expect.objectContaining({
        opacity: 1,
        shadow: expect.anything(),
        stroke: 'rgba(255, 0, 0, 1)',
        strokeWidth: 4,
      })
    );
    expect(brushObject).toMatchObject({ sniptaleBrushShadow: 30, sniptaleBrushSmoothing: 6 });
  });

  it('applies shape settings through the object factory seam', () => {
    const shapeObject = { kind: 'shape' };

    applySelectionToolSettingsToObjects([shapeObject] as never, 'rectangle', settings as never);
    expect(mocks.applyShapeSettingsMock).toHaveBeenCalledWith(
      shapeObject,
      'rectangle',
      settings.rectangle
    );
  });
}

function registerTextSyncTests() {
  it('applies text settings only to text owners', () => {
    const textbox = { kind: 'textbox', set: vi.fn() };

    applySelectionToolSettingsToObjects([textbox] as never, 'text', settings as never);
    expect(textbox.set).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: '',
        fill: 'rgba(34, 34, 34, 1)',
        fontStyle: 'italic',
        fontWeight: 'bold',
        linethrough: true,
        textBackgroundColor: 'rgba(238, 238, 238, 0.4)',
        underline: true,
      })
    );
    expect(textbox).toMatchObject({
      sniptaleTextBackgroundOpacity: 0.4,
      sniptaleTextCalloutFormat: 'plain',
      sniptaleTextLayoutMode: 'auto',
      sniptaleTextCalloutShadow: 0,
      sniptaleTextVerticalAlign: 'bottom',
    });
    expect(textbox.set).toHaveBeenCalledWith(
      expect.objectContaining({
        textAlign: 'center',
      })
    );
  });
}

function registerStepSyncTests() {
  it('applies step settings only to grouped step owners', () => {
    const circle = { set: vi.fn() };
    const label = { set: vi.fn() };
    const group = {
      getObjects: () => [circle, label],
      kind: 'group',
      setCoords: vi.fn(),
      triggerLayout: vi.fn(),
      dirty: false,
      sniptaleStepSizeLevel: undefined,
      sniptaleStepType: undefined,
    };

    applySelectionToolSettingsToObjects([group] as never, 'step', settings as never);
    expect(circle.set).toHaveBeenCalledWith(
      expect.objectContaining({ fill: 'rgba(34, 34, 34, 1)', radius: expect.any(Number) })
    );
    expect(label.set).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: expect.any(Number), text: '1' })
    );
    expect(group.sniptaleStepType).toBe('number');
    expect(group.sniptaleStepSizeLevel).toBe(5);
    expect(group.triggerLayout).toHaveBeenCalledOnce();
    expect(group.setCoords).toHaveBeenCalledOnce();
    expect(group.dirty).toBe(true);
  });
}

function registerArrowTests() {
  it('applies arrow settings only to arrow objects', () => {
    const arrow = { kind: 'arrow' };

    applySelectionToolSettingsToObjects([arrow] as never, 'arrow', settings as never);
    expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(arrow, {
      settings: expect.objectContaining({ endHead: 'block' }),
    });
  });
}

function registerBlurTests() {
  it('applies blur settings only to blur objects', () => {
    const blur = { kind: 'blur' };

    applySelectionToolSettingsToObjects([blur] as never, 'blur', settings as never);
    expect(mocks.updateBlurObjectMock).toHaveBeenCalledWith(blur, {
      settings: {
        amount: 18,
        blurType: 'solid',
        showBorder: true,
      },
    });
  });
}

function registerNoopSelectionApplyTest() {
  it('skips non-configurable object types without mutating objects', () => {
    const object = { set: vi.fn() };

    applySelectionToolSettingsToObjects([object] as never, 'image', settings as never);

    expect(object.set).not.toHaveBeenCalled();
    expect(mocks.updateArrowObjectMock).not.toHaveBeenCalled();
    expect(mocks.updateBlurObjectMock).not.toHaveBeenCalled();
  });
}

function registerGeometricShapeBranchTests() {
  it('applies shape settings across every geometric shape branch', () => {
    applySelectionToolSettingsToObjects(
      [{ kind: 'ellipse' }] as never,
      'ellipse',
      settings as never
    );
    applySelectionToolSettingsToObjects(
      [{ kind: 'diamond' }] as never,
      'diamond',
      settings as never
    );

    expect(mocks.applyShapeSettingsMock).toHaveBeenCalledWith(
      expect.anything(),
      'ellipse',
      settings.ellipse
    );
    expect(mocks.applyShapeSettingsMock).toHaveBeenCalledWith(
      expect.anything(),
      'diamond',
      settings.rectangle
    );
    applySelectionToolSettingsToObjects(
      [{ kind: 'rich-shape' }] as never,
      'rich-shape',
      settings as never
    );
    expect(mocks.updateRichShapeObjectStyleMock).toHaveBeenCalledWith(expect.anything(), settings);
  });
}
function runApplySelectionSuite() {
  beforeEach(() => vi.clearAllMocks());
  registerBrushAndShapeTests();
  registerTextSyncTests();
  registerStepSyncTests();
  registerArrowTests();
  registerBlurTests();
  registerNoopSelectionApplyTest();
  registerGeometricShapeBranchTests();
}
describe('editor-controller selection apply owner seam', runApplySelectionSuite);
