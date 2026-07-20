import { expect, it } from 'vitest';
import { parseScenarioEditorCanvasJson } from './editor-canvas-json';

it('returns null for malformed or non-object canvas JSON', () => {
  expect(parseScenarioEditorCanvasJson('{')).toBeNull();
  expect(parseScenarioEditorCanvasJson('null')).toBeNull();
  expect(parseScenarioEditorCanvasJson('"canvas"')).toBeNull();
  expect(parseScenarioEditorCanvasJson('[]')).toBeNull();
});

it('normalizes absent object arrays and non-string versions', () => {
  expect(parseScenarioEditorCanvasJson('{"version":7,"objects":"bad"}')).toEqual({
    objects: [],
    version: null,
  });
});

it('keeps only record objects from the canvas object list', () => {
  expect(
    parseScenarioEditorCanvasJson(
      JSON.stringify({
        version: '7.2.0',
        objects: [{ id: 'keep' }, null, 'drop', ['drop-array'], { id: 'also-keep' }],
      })
    )
  ).toEqual({
    objects: [{ id: 'keep' }, { id: 'also-keep' }],
    version: '7.2.0',
  });
});
