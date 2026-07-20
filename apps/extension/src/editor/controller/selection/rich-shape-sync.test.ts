import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { syncSelectionToolSettingsFromObject } from './sync/dispatch';
import { syncRichShapeSelectionSettings } from './rich-shape-sync';

const mocks = vi.hoisted(() => ({
  getArrowSettings: vi.fn(() => ({
    color: '#654321',
    endHead: 'block',
    mode: 'curve',
    opacity: 0.6,
    shadow: 20,
    startHead: 'none',
    variant: 'standard',
    width: 6,
  })),
  getBlurSettings: vi.fn(() => ({ amount: 0.4, type: 'pixelate' })),
  isArrowObject: vi.fn((object: { kind?: string }) => object.kind === 'arrow'),
  isBlurObject: vi.fn((object: { kind?: string }) => object.kind === 'blur'),
  isGroup: vi.fn((object: { kind?: string }) => object.kind === 'group'),
  isTextbox: vi.fn((object: { kind?: string }) => object.kind === 'text'),
  parseColorForStore: vi.fn((value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback
  ),
  updateSelectionArrowSettings: vi.fn(),
  updateSelectionBlurSettings: vi.fn(),
  updateSelectionBrushSettings: vi.fn(),
  updateSelectionShapeSettings: vi.fn(),
  updateSelectionStepSettings: vi.fn(),
  updateSelectionTextSettings: vi.fn(),
}));

const selectionToolSettings = vi.hoisted(() => ({
  arrow: {
    color: '#111111',
    endHead: 'none',
    mode: 'straight',
    opacity: 1,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 2,
  },
  highlighter: { color: '#ffee00', opacity: 0.5, smoothingLevel: 4, width: 10 },
  rectangle: {
    borderPresetId: null,
    fillColor: '#ffffff',
    fillOpacity: 1,
    opacity: 1,
    radius: 0,
    shadow: 0,
    strokeColor: '#000000',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 1,
  },
  step: { alphabet: 'latin', color: '#111111', sizeLevel: 'm', type: 'numeric', value: '1' },
  text: {
    backgroundColor: '#ffffff',
    backgroundOpacity: 1,
    calloutFormat: 'panel',
    fontFamily: 'sans',
    fontSize: 16,
    fontStyle: 'normal',
    fontWeight: 'normal',
    layoutMode: 'fixed-width',
    linethrough: false,
    textColor: '#000000',
    underline: false,
  },
}));

vi.mock('../../state/useEditorStore', () => ({
  EditorInspector: {},
  EditorState: {},
  useEditorStore: {
    getState: () => ({
      selectionToolSettings,
      updateSelectionArrowSettings: mocks.updateSelectionArrowSettings,
      updateSelectionBlurSettings: mocks.updateSelectionBlurSettings,
      updateSelectionBrushSettings: mocks.updateSelectionBrushSettings,
      updateSelectionShapeSettings: mocks.updateSelectionShapeSettings,
      updateSelectionStepSettings: mocks.updateSelectionStepSettings,
      updateSelectionTextSettings: mocks.updateSelectionTextSettings,
    }),
  },
}));
vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isGroup: mocks.isGroup,
  isTextbox: mocks.isTextbox,
  parseColorForStore: mocks.parseColorForStore,
}));
vi.mock('../../objects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects')>()),
}));
vi.mock('../../objects/annotation/blur/object/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object/settings')>()),
  getBlurSettings: mocks.getBlurSettings,
}));
vi.mock('../../objects/annotation/blur/object/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object/identity')>()),
  isBlurObject: mocks.isBlurObject,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowSettings: mocks.getArrowSettings,
  isArrowObject: mocks.isArrowObject,
}));

function createRichShapeObject(overrides: Parameters<typeof createDefaultRichShapeObject>[0] = {}) {
  return {
    sniptaleId: 'shape-1',
    sniptaleRichShape: createDefaultRichShapeObject(overrides),
    sniptaleType: 'rich-shape',
  };
}

function createProjectedRichShape() {
  return createRichShapeObject({
    effects: {
      ...createDefaultRichShapeObject().effects,
      shadow: {
        ...createDefaultRichShapeObject().effects.shadow,
        enabled: true,
        opacity: 0.42,
      },
    },
    style: {
      ...createDefaultRichShapeObject().style,
      fill: { type: 'solid', color: '#abcdef' },
      fillTransparency: 0.25,
      line: {
        ...createDefaultRichShapeObject().style.line,
        dashStyle: 'dot',
        transparency: 0.5,
        width: 5,
      },
    },
    text: {
      ...createDefaultRichShapeObject().text,
      color: '#123456',
      fontFamily: 'serif',
      fontSize: 24,
      strike: true,
      underline: true,
    },
  });
}

it('projects rich-shape selection state into legacy shape and text inspector defaults', () => {
  syncRichShapeSelectionSettings(createProjectedRichShape() as never);

  expect(mocks.updateSelectionShapeSettings).toHaveBeenCalledWith('rectangle', {
    fillColor: '#abcdef',
    fillOpacity: 0.75,
    opacity: 1,
    radius: 0,
    shadow: 42,
    strokeColor: '#111827',
    strokeOpacity: 0.5,
    strokeStyle: 'dotted',
    strokeWidth: 5,
  });
  expect(mocks.updateSelectionTextSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      fontFamily: 'serif',
      fontSize: 24,
      linethrough: true,
      textColor: '#123456',
      underline: true,
    })
  );
});

it('routes rich-shape selection sync and ignores non rich-shape objects', () => {
  syncSelectionToolSettingsFromObject(
    createRichShapeObject({
      style: {
        ...createDefaultRichShapeObject().style,
        fill: { type: 'gradient', gradientType: 'radial', angle: 0, stops: [] },
        line: { ...createDefaultRichShapeObject().style.line, dashStyle: 'solid' },
      },
      text: { ...createDefaultRichShapeObject().text, fontFamily: 'unknown' },
    }) as never,
    'rich-shape'
  );
  syncRichShapeSelectionSettings({ sniptaleType: 'rect' } as never);

  expect(mocks.updateSelectionShapeSettings).toHaveBeenLastCalledWith(
    'rectangle',
    expect.objectContaining({
      fillColor: 'transparent',
      strokeStyle: 'solid',
    })
  );
  expect(mocks.updateSelectionTextSettings).toHaveBeenLastCalledWith(
    expect.objectContaining({ fontFamily: 'sans' })
  );
});

it('keeps the shared selection sync dispatcher covered for adjacent object families', () => {
  const rect = new Rect({ fill: '#eeeeee', opacity: 0.7, rx: 9, stroke: '#222222' });
  rect.set({ strokeWidth: 3 });

  syncSelectionToolSettingsFromObject({ opacity: 0.4, stroke: '#123123' } as never, 'highlighter');
  syncSelectionToolSettingsFromObject(rect as never, 'rectangle');
  syncSelectionToolSettingsFromObject({ kind: 'blur' } as never, 'blur');
  syncSelectionToolSettingsFromObject(
    { backgroundColor: '#ffffff', fill: '#333333', fontFamily: 'Mono', kind: 'text' } as never,
    'text'
  );
  syncSelectionToolSettingsFromObject(
    { getObjects: () => [{ fill: '#ff0000' }], kind: 'group', sniptaleStepValue: '7' } as never,
    'step'
  );
  syncSelectionToolSettingsFromObject({ kind: 'arrow' } as never, 'arrow');
  syncSelectionToolSettingsFromObject({} as never, 'arrow');
  syncSelectionToolSettingsFromObject({} as never, 'blur');
  syncSelectionToolSettingsFromObject({} as never, 'text');
  syncSelectionToolSettingsFromObject({ kind: 'group', getObjects: () => [] } as never, 'step');
  syncSelectionToolSettingsFromObject({} as never, 'step');
  syncSelectionToolSettingsFromObject({} as never, 'background');

  expect(mocks.updateSelectionBrushSettings).toHaveBeenCalled();
  expect(mocks.updateSelectionShapeSettings).toHaveBeenCalledWith(
    'rectangle',
    expect.objectContaining({ radius: 9 })
  );
  expect(mocks.updateSelectionBlurSettings).toHaveBeenCalledWith({
    amount: 0.4,
    type: 'pixelate',
  });
  expect(mocks.updateSelectionTextSettings).toHaveBeenCalledWith(
    expect.objectContaining({ fontFamily: 'mono' })
  );
  expect(mocks.updateSelectionStepSettings).toHaveBeenCalledWith(
    expect.objectContaining({ color: '#ff0000' })
  );
  expect(mocks.updateSelectionArrowSettings).toHaveBeenCalledWith(
    expect.objectContaining({ endHead: 'block' })
  );
});
