import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyImageSettings: vi.fn(),
  applyShapeSettings: vi.fn(),
  applyTextCalloutRendering: vi.fn(),
  applyTextLayout: vi.fn(),
  isArrowObject: vi.fn((object: { kind?: string }) => object.kind === 'arrow'),
  isBlurObject: vi.fn((object: { kind?: string }) => object.kind === 'blur'),
  isGroup: vi.fn((object: { kind?: string }) => object.kind === 'group'),
  isImageLayerStyleObject: vi.fn((object: { kind?: string }) => object.kind === 'image'),
  isLineObject: vi.fn((object: { kind?: string }) => object.kind === 'line'),
  isTextbox: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
  updateArrowObject: vi.fn(),
  updateBlurObject: vi.fn(),
  updateLineObject: vi.fn(),
  updateRichShapeObjectStyle: vi.fn(),
  updateStepGroup: vi.fn(),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isGroup: mocks.isGroup,
  isTextbox: mocks.isTextbox,
}));

vi.mock('../../objects/annotation/text/layout/apply', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/layout/apply')>()),
  applyTextLayout: mocks.applyTextLayout,
}));

vi.mock('../../objects/annotation/text/callout/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/callout/lifecycle')>()),
  applyTextCalloutRendering: mocks.applyTextCalloutRendering,
}));

vi.mock('../../objects/annotation/text/callout/format', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/callout/format')>()),
  getTextCalloutBackgroundColor: (settings: { backgroundColor: string; calloutFormat: string }) =>
    settings.calloutFormat === 'plain' ? '' : settings.backgroundColor,
  getTextCalloutPadding: (format: string) => (format === 'plain' ? 0 : 12),
}));

vi.mock('../../objects/annotation/text/appearance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/appearance')>()),
  getTextFillColor: (settings: { textColor: string }) => settings.textColor,
  getTextGlyphBackgroundColor: (settings: { backgroundColor: string }) => settings.backgroundColor,
}));

vi.mock('../../objects/image-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/image-style')>()),
  applyImageSettings: mocks.applyImageSettings,
  isImageLayerStyleObject: mocks.isImageLayerStyleObject,
}));

vi.mock('../../objects/annotation/blur/object/identity', () => ({
  isBlurObject: mocks.isBlurObject,
}));

vi.mock('../../objects/annotation/blur/object/update', () => ({
  updateBlurObject: mocks.updateBlurObject,
}));

vi.mock('../../objects/annotation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation')>()),
  updateStepGroup: mocks.updateStepGroup,
}));

vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObject,
  updateArrowObject: mocks.updateArrowObject,
}));

vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  isLineObject: mocks.isLineObject,
  updateLineObject: mocks.updateLineObject,
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  updateRichShapeObjectStyle: mocks.updateRichShapeObjectStyle,
}));

vi.mock('../../objects/shape-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/shape-style')>()),
  applyShapeSettings: mocks.applyShapeSettings,
}));

import { applyTextSelectionSettings } from './apply-text';
import { applySelectionToolSettingsToObjects } from './apply/dispatch';

function createTextSettings() {
  return {
    backgroundColor: '#ffffff',
    backgroundOpacity: undefined,
    calloutFormat: 'panel',
    fontFamily: 'Inter',
    fontSize: 18,
    fontStyle: 'italic',
    fontWeight: 'bold',
    layoutMode: 'fit',
    linethrough: true,
    shadow: 20,
    shadowAngle: undefined,
    shadowBlur: undefined,
    shadowColor: '',
    shadowDistance: undefined,
    textAlign: 'center',
    textColor: '#111111',
    textOpacity: undefined,
    underline: true,
    verticalAlign: 'middle',
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('applies forced plain text selection settings without callout background', () => {
  const textbox: Record<string, unknown> & { set: ReturnType<typeof vi.fn> } = {
    kind: 'textbox',
    set: vi.fn(),
  };

  applyTextSelectionSettings([textbox] as never, createTextSettings() as never, {
    forcePlain: true,
  });

  expect(textbox.set).toHaveBeenCalledWith(
    expect.objectContaining({
      backgroundColor: '',
      fontSize: 18,
      padding: 0,
      textAlign: 'center',
    })
  );
  expect(textbox['sniptaleTextCalloutFormat']).toBe('plain');
  expect(textbox['sniptaleTextOpacity']).toBe(1);
  expect(textbox['sniptaleTextBackgroundOpacity']).toBe(1);
  expect(textbox['sniptaleTextShadowAngle']).toBe(90);
  expect(textbox['sniptaleTextShadowBlur']).toBe(12);
  expect(textbox['sniptaleTextShadowColor']).toBe('#111111');
  expect(textbox['sniptaleTextShadowDistance']).toBe(4);
  expect(mocks.applyTextLayout).toHaveBeenCalledWith(textbox, { layoutMode: 'fit' });
  expect(mocks.applyTextCalloutRendering).toHaveBeenCalledWith(textbox);
});

it('preserves configured callout metadata for meta-stamp style application', () => {
  const textbox: Record<string, unknown> & { set: ReturnType<typeof vi.fn> } = {
    kind: 'textbox',
    set: vi.fn(),
  };

  applyTextSelectionSettings(
    [textbox] as never,
    {
      ...createTextSettings(),
      backgroundOpacity: 0.45,
      shadowAngle: 135,
      shadowBlur: 8,
      shadowColor: '#222222',
      shadowDistance: 6,
      textOpacity: 0.8,
    } as never
  );

  expect(textbox.set).toHaveBeenCalledWith(expect.objectContaining({ padding: 12 }));
  expect(textbox['sniptaleTextCalloutFormat']).toBe('panel');
  expect(textbox['sniptaleTextOpacity']).toBe(0.8);
  expect(textbox['sniptaleTextBackgroundOpacity']).toBe(0.45);
  expect(textbox['sniptaleTextShadowAngle']).toBe(135);
  expect(textbox['sniptaleTextShadowBlur']).toBe(8);
  expect(textbox['sniptaleTextShadowColor']).toBe('#222222');
  expect(textbox['sniptaleTextShadowDistance']).toBe(6);
});

it('ignores non-textbox objects', () => {
  const object = { kind: 'shape', set: vi.fn() };

  applyTextSelectionSettings([object] as never, createTextSettings() as never);

  expect(object.set).not.toHaveBeenCalled();
  expect(mocks.applyTextLayout).not.toHaveBeenCalled();
});

it('routes text selection dispatch and keeps inert selection types as no-ops', () => {
  const textbox = { kind: 'textbox', set: vi.fn() };

  applySelectionToolSettingsToObjects([textbox] as never, 'transparent-base', {} as never);
  applySelectionToolSettingsToObjects([textbox] as never, 'browser-frame', {} as never);
  applySelectionToolSettingsToObjects([textbox] as never, 'text', {
    text: createTextSettings(),
  } as never);

  expect(textbox.set).toHaveBeenCalledOnce();
  expect(mocks.applyTextCalloutRendering).toHaveBeenCalledWith(textbox);
});

it('routes image-family selection dispatch through image-style ownership', () => {
  const image = { kind: 'image' };
  const settings = { image: { opacity: 0.75 } };

  applySelectionToolSettingsToObjects([image] as never, 'source-image', settings as never);
  applySelectionToolSettingsToObjects([image] as never, 'image', settings as never);
  applySelectionToolSettingsToObjects([image] as never, 'background', settings as never);

  expect(mocks.applyImageSettings).toHaveBeenCalledTimes(3);
  expect(mocks.applyImageSettings).toHaveBeenCalledWith(image, settings.image);
});

it('routes advanced non-text selection dispatch through object owners', () => {
  const group = { kind: 'group' };
  const arrow = { kind: 'arrow' };
  const line = { kind: 'line' };
  const blur = { kind: 'blur' };
  const richShape = { kind: 'rich-shape' };
  const settings = {
    arrow: { color: '#111111' },
    blur: { amount: 8 },
    line: { color: '#222222' },
    richShape: { fill: '#333333' },
    step: { value: '7' },
  };

  applySelectionToolSettingsToObjects([group] as never, 'step', settings as never);
  applySelectionToolSettingsToObjects([arrow] as never, 'arrow', settings as never);
  applySelectionToolSettingsToObjects([line] as never, 'line', settings as never);
  applySelectionToolSettingsToObjects([blur] as never, 'blur', settings as never);
  applySelectionToolSettingsToObjects([richShape] as never, 'rich-shape', settings as never);

  expect(mocks.updateStepGroup).toHaveBeenCalledWith(group, settings.step);
  expect(mocks.updateArrowObject).toHaveBeenCalledWith(arrow, { settings: settings.arrow });
  expect(mocks.updateLineObject).toHaveBeenCalledWith(line, { settings: settings.line });
  expect(mocks.updateBlurObject).toHaveBeenCalledWith(blur, { settings: settings.blur });
  expect(mocks.updateRichShapeObjectStyle).toHaveBeenCalledWith(richShape, settings);
});
