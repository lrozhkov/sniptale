import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../features/editor/document/constants';

const mocks = vi.hoisted(() => ({
  applyShapeSettingsMock: vi.fn(),
  getBlurSettingsMock: vi.fn(() => ({ amount: 8, blurType: 'gaussian' })),
  isArrowObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'arrow'),
  isBlurObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'blur'),
  isGroupMock: vi.fn((object: { kind?: string }) => object.kind === 'group'),
  isTextboxMock: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
  readFreehandColorInputMock: vi.fn(() => '#123456'),
  readFreehandDynamicWidthMock: vi.fn(() => true),
  readFreehandShadowAngleMock: vi.fn(() => 180),
  readFreehandShadowColorMock: vi.fn(() => '#654321'),
  readFreehandSmoothingLevelMock: vi.fn(() => 7),
  readFreehandWidthMock: vi.fn(() => 9),
  syncArrowSelectionSettingsMock: vi.fn(),
  syncLineSelectionSettingsMock: vi.fn(),
  syncRichShapeSelectionSettingsMock: vi.fn(),
  updateSelectionBlurSettingsMock: vi.fn(),
  updateSelectionBrushSettingsMock: vi.fn(),
  updateSelectionImageSettingsMock: vi.fn(),
  updateSelectionShapeSettingsMock: vi.fn(),
  updateSelectionStepSettingsMock: vi.fn(),
  updateSelectionTextSettingsMock: vi.fn(),
  updateArrowObjectMock: vi.fn(),
}));

const baseSelectionToolSettings = vi.hoisted(() => ({
  highlighter: {
    color: '#ffee00',
    dynamicWidth: false,
    opacity: 0.3,
    shadow: 0,
    smoothingLevel: 4,
    width: 12,
  },
  pencil: {
    color: '#ff0000',
    dynamicWidth: true,
    opacity: 1,
    shadow: 0,
    shadowAngle: 90,
    shadowColor: '#ff0000',
    smoothingLevel: 4,
    width: 4,
  },
  rectangle: {
    borderPresetId: null,
    customCss: '',
    fillColor: '#ffffff',
    fillOpacity: 1,
    inheritCustomCss: false,
    opacity: 1,
    radius: 0,
    shadow: 0,
    strokeColor: '#000000',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 1,
  },
}));

const annotationSelectionToolSettings = vi.hoisted(() => ({
  image: {
    borderPresetId: null,
    opacity: 1,
    radius: 0,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: '#111827',
    shadowDistance: 4,
    strokeColor: '#111827',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 0,
  },
  step: { alphabet: 'latin', color: '#222222', sizeLevel: 3, type: 'number', value: '1' },
  text: {
    backgroundColor: '#ffffff',
    backgroundOpacity: 1,
    calloutFormat: 'panel',
    fontFamily: 'sans',
    fontSize: 16,
    fontStyle: 'normal',
    fontWeight: 'normal',
    layoutMode: 'auto',
    linethrough: false,
    shadow: 0,
    textAlign: 'left',
    textColor: '#111111',
    underline: false,
    verticalAlign: 'top',
  },
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: {
        ...baseSelectionToolSettings,
        ...annotationSelectionToolSettings,
      },
      updateSelectionBlurSettings: mocks.updateSelectionBlurSettingsMock,
      updateSelectionBrushSettings: mocks.updateSelectionBrushSettingsMock,
      updateSelectionImageSettings: mocks.updateSelectionImageSettingsMock,
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
}));
vi.mock('../../objects/shadow', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shadow')>('../../objects/shadow')),
  createFabricShadow: vi.fn(() => ({ blur: 10 })),
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
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObjectMock,
  updateArrowObject: mocks.updateArrowObjectMock,
}));
vi.mock('../../objects/annotation/blur/object/settings', () => ({
  getBlurSettings: mocks.getBlurSettingsMock,
}));
vi.mock('../../objects/annotation/blur/object/identity', () => ({
  isBlurObject: mocks.isBlurObjectMock,
}));
vi.mock('../../objects/shape-style', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shape-style')>(
    '../../objects/shape-style'
  )),
  applyShapeSettings: mocks.applyShapeSettingsMock,
}));
vi.mock('../freehand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../freehand')>()),
  readFreehandColorInput: mocks.readFreehandColorInputMock,
  readFreehandDynamicWidth: mocks.readFreehandDynamicWidthMock,
  readFreehandShadowAngle: mocks.readFreehandShadowAngleMock,
  readFreehandShadowColor: mocks.readFreehandShadowColorMock,
  readFreehandSmoothingLevel: mocks.readFreehandSmoothingLevelMock,
  readFreehandWidth: mocks.readFreehandWidthMock,
}));
vi.mock('./rich-shape-sync', () => ({
  syncRichShapeSelectionSettings: mocks.syncRichShapeSelectionSettingsMock,
}));
vi.mock('./sync-linear', () => ({
  syncArrowSelectionSettings: mocks.syncArrowSelectionSettingsMock,
  syncLineSelectionSettings: mocks.syncLineSelectionSettingsMock,
}));

import { applySelectionToolSettingsToObjects } from './apply/dispatch';
import { syncSelectionToolSettingsFromObject } from './sync/dispatch';

const settings = {
  text: {
    backgroundColor: '#eeeeee',
    backgroundOpacity: 0.4,
    calloutFormat: 'plain' as const,
    fontSize: 18,
    fontStyle: 'italic' as const,
    fontWeight: 'bold' as const,
    layoutMode: 'auto' as const,
    linethrough: true,
    shadow: 0,
    textAlign: 'center' as const,
    textColor: '#222222',
    underline: true,
  },
} as const;

it('preserves meta-stamp callout settings and fills default text metadata', () => {
  const textbox = { kind: 'textbox', set: vi.fn() };

  applySelectionToolSettingsToObjects([textbox] as never, 'meta-stamp', {
    text: { ...settings.text, backgroundOpacity: undefined, calloutFormat: 'panel' },
  } as never);

  expect(textbox).toMatchObject({
    sniptaleTextBackgroundOpacity: 1,
    sniptaleTextCalloutFormat: 'panel',
    sniptaleTextShadowColor: '#222222',
  });
});

it('treats non-configurable non-text layer object types as explicit no-op branches', () => {
  applySelectionToolSettingsToObjects(
    [{ kind: 'image' }] as never,
    'image' as never,
    settings as never
  );
  applySelectionToolSettingsToObjects(
    [{ kind: 'browser-frame' }] as never,
    'browser-frame' as never,
    settings as never
  );
  applySelectionToolSettingsToObjects(
    [{ kind: 'background' }] as never,
    'background' as never,
    settings as never
  );
  applySelectionToolSettingsToObjects(
    [{ kind: 'transparent-base' }] as never,
    'transparent-base' as never,
    settings as never
  );
  applySelectionToolSettingsToObjects(
    [{ kind: 'source-image' }] as never,
    'source-image' as never,
    settings as never
  );

  expect(mocks.applyShapeSettingsMock).not.toHaveBeenCalled();
  expect(mocks.updateArrowObjectMock).not.toHaveBeenCalled();
});

it('applies text settings to meta stamps through the shared textbox branch', () => {
  const textbox = { kind: 'textbox', set: vi.fn() };

  applySelectionToolSettingsToObjects([textbox] as never, 'meta-stamp' as never, settings as never);

  expect(textbox.set).toHaveBeenCalledWith(
    expect.objectContaining({
      backgroundColor: '',
      fill: 'rgba(34, 34, 34, 1)',
      fontStyle: 'italic',
      fontWeight: 'bold',
    })
  );
});

it('covers selection sync dispatch branches used by apply-adjacent owners', () => {
  syncSelectionToolSettingsFromObject({ opacity: 0.5 } as never, 'pencil');
  syncSelectionToolSettingsFromObject(
    { fill: '#ffffff', sniptaleShapeShadow: 10, stroke: '#000000', strokeWidth: 2 } as never,
    'rectangle'
  );
  syncSelectionToolSettingsFromObject({ kind: 'blur' } as never, 'blur');
  syncSelectionToolSettingsFromObject(
    {
      backgroundColor: '#ffffff',
      fill: '#111111',
      fontFamily: 'mono',
      kind: 'textbox',
      sniptaleTextBackgroundOpacity: 0.5,
      textAlign: 'right',
    } as never,
    'text'
  );
  syncSelectionToolSettingsFromObject(
    { getObjects: () => [{ fill: '#333333' }], kind: 'group', sniptaleStepValue: '2' } as never,
    'step'
  );
  syncSelectionToolSettingsFromObject({} as never, 'arrow');
  syncSelectionToolSettingsFromObject({} as never, 'line');
  syncSelectionToolSettingsFromObject({} as never, 'rich-shape');
  syncSelectionToolSettingsFromObject({ sniptaleImageOpacity: 0.5 } as never, 'image');

  expect(mocks.updateSelectionBrushSettingsMock).toHaveBeenCalledWith(
    'pencil',
    expect.objectContaining({ shadowAngle: 180, shadowColor: '#654321' })
  );
  expect(mocks.updateSelectionShapeSettingsMock).toHaveBeenCalledOnce();
  expect(mocks.updateSelectionBlurSettingsMock).toHaveBeenCalledWith({
    amount: 8,
    blurType: 'gaussian',
  });
  expect(mocks.updateSelectionTextSettingsMock).toHaveBeenCalledOnce();
  expect(mocks.updateSelectionStepSettingsMock).toHaveBeenCalledTimes(2);
  expect(mocks.updateSelectionImageSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      opacity: 0.5,
      radius: 0,
      strokeColor: DEFAULT_EDITOR_IMAGE_SETTINGS.strokeColor,
    })
  );
  expect(mocks.syncArrowSelectionSettingsMock).toHaveBeenCalledOnce();
  expect(mocks.syncLineSelectionSettingsMock).toHaveBeenCalledOnce();
  expect(mocks.syncRichShapeSelectionSettingsMock).toHaveBeenCalledOnce();
});
