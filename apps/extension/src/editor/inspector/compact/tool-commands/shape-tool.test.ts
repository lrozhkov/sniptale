import { expect, it } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { resolveShapeTool } from './shape-tool';

function createParams(highlightedTool: string) {
  return {
    ...createInspectorCommandParams(),
    highlightedTool,
  };
}

it('resolves the shape tool from highlighted tool state', () => {
  expect(resolveShapeTool(createParams('rectangle') as never)).toBe('rectangle');
  expect(resolveShapeTool(createParams('ellipse') as never)).toBe('ellipse');
  expect(resolveShapeTool(createParams('diamond') as never)).toBe('diamond');
});
