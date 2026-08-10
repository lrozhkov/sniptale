import { beforeEach, expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';

const mocks = vi.hoisted(() => ({
  buildCropCompactCommands: vi.fn(() => [{ id: 'crop' }]),
  buildImageCompactCommands: vi.fn(() => [{ id: 'image' }]),
  buildRichShapeCompactCommands: vi.fn(() => [{ id: 'rich' }]),
  buildStepCompactCommands: vi.fn(() => [{ id: 'step' }]),
  prependToolTemplateCommand: vi.fn((_params, commands) => [{ id: 'template' }, ...commands]),
}));

vi.mock('./image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./image')>()),
  buildImageCompactCommands: mocks.buildImageCompactCommands,
}));
vi.mock('./rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./rich-shape')>()),
  buildRichShapeCompactCommands: mocks.buildRichShapeCompactCommands,
}));
vi.mock('./template', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./template')>()),
  prependToolTemplateCommand: mocks.prependToolTemplateCommand,
}));
vi.mock('../../tools/tool-inspector/session-sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../tools/tool-inspector/session-sections')>()),
  buildCropCompactCommands: mocks.buildCropCompactCommands,
  buildStepCompactCommands: mocks.buildStepCompactCommands,
}));

import { buildToolCompactCommands } from '.';

beforeEach(() => vi.clearAllMocks());

it('routes current rich shape, image, step, crop, and empty tool command owners', () => {
  const params = createInspectorCommandParams();
  Object.assign(params, { richShapeSelection: null });
  const controller = { applyCropSelection: vi.fn() };
  const build = () => Reflect.apply(buildToolCompactCommands, null, [params, controller]);
  params.inspector = 'frame';
  expect(build()).toEqual([]);

  params.inspector = 'tool';
  params.selection.selectedObjectType = 'rich-shape';
  expect(build()).toEqual([{ id: 'rich' }]);

  params.selection.selectedObjectType = 'source-image';
  expect(build()).toEqual([{ id: 'image' }]);

  Reflect.set(params.selection, 'selectedObjectType', null);
  params.highlightedTool = 'step';
  expect(build()).toEqual([{ id: 'template' }, { id: 'step' }]);

  params.highlightedTool = 'crop';
  expect(build()).toEqual([{ id: 'crop' }]);
  params.highlightedTool = 'pencil';
  expect(build()).toEqual([]);
});
