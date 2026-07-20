import { expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildToolCompactCommands } from './';

const controller = {
  applyCropSelection: vi.fn(async () => undefined),
  clearRasterSelection: vi.fn(),
};

function commandIds(overrides: Record<string, unknown>) {
  const params = {
    ...createInspectorCommandParams(),
    inspector: 'tool',
    ...overrides,
  };
  return buildToolCompactCommands(params as never, controller).map((command) => command.id);
}

it('returns no future-tool commands for non-tool inspectors and passive tools', () => {
  expect(commandIds({ inspector: 'frame', highlightedTool: 'arrow' })).toEqual([]);
  expect(commandIds({ highlightedTool: 'select' })).toEqual([]);
  expect(commandIds({ highlightedTool: 'shape-library' })).toEqual([]);
  expect(commandIds({ highlightedTool: 'callout' })).toEqual([]);
});

it('routes raster, drawing, text, step, and crop tools to their compact command builders', () => {
  expectRasterCommandRoutes();
  expectDrawingCommandRoutes();
  expectImageSelectionCommandRoutes();
});

function expectRasterCommandRoutes() {
  expect(commandIds({ highlightedTool: 'selection' })).toEqual([
    'raster-selection-mode',
    'raster-selection-clear',
  ]);
  expect(commandIds({ highlightedTool: 'brush' })).toEqual([
    'raster-brush-size',
    'raster-brush-color',
    'raster-brush-opacity',
    'raster-brush-hardness',
    'raster-brush-clear',
  ]);
  expect(commandIds({ highlightedTool: 'eraser' })).toEqual([
    'raster-eraser-size',
    'raster-eraser-clear',
  ]);
  expect(commandIds({ highlightedTool: 'fill' })).toEqual([
    'raster-fill-mode',
    'raster-fill-color',
    'raster-fill-selection',
  ]);
}

function expectDrawingCommandRoutes() {
  expect(commandIds({ highlightedTool: 'pencil' })).toContain('pencil-color');
  expect(commandIds({ highlightedTool: 'rectangle' })).toContain('shape-fill-color');
  expect(commandIds({ highlightedTool: 'blur' })).toContain('blur-type');
  expect(commandIds({ highlightedTool: 'arrow' })).toContain('arrow-color');
  expect(commandIds({ highlightedTool: 'line' })).toContain('line-fill');
  expect(commandIds({ highlightedTool: 'text' })).toContain('text-color');
  expect(commandIds({ highlightedTool: 'step' })).toContain('step-text-color');
  expect(commandIds({ highlightedTool: 'crop' })).toContain('crop-apply');
}

function expectImageSelectionCommandRoutes() {
  expect(commandIdsWithSelection('brush', 'image')).toContain('raster-brush-size');
  expect(commandIdsWithSelection('select', 'image')).toEqual(IMAGE_COMMAND_IDS);
  expect(commandIdsWithSelection('select', 'source-image')).toEqual(IMAGE_COMMAND_IDS);
  expect(commandIdsWithSelection('select', 'background')).toEqual(IMAGE_COMMAND_IDS);
}

function commandIdsWithSelection(highlightedTool: string, selectedObjectType: string) {
  return commandIds({
    highlightedTool,
    selection: { ...createInspectorCommandParams().selection, selectedObjectType },
  });
}

const IMAGE_COMMAND_IDS = [
  'image-opacity',
  'image-radius',
  'image-shadow',
  'image-stroke-width',
  'image-stroke-style',
  'image-stroke-color',
  'image-stroke-opacity',
];

it('uses rich-shape selection commands before highlighted tool commands', () => {
  expect(
    commandIds({
      highlightedTool: 'arrow',
      richShapeSelection: createDefaultRichShapeObject(),
      selection: { ...createInspectorCommandParams().selection, selectedObjectType: 'rich-shape' },
    })[0]
  ).toBe('rich-shape-line');
});
