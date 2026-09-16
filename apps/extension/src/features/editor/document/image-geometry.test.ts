import { expect, it } from 'vitest';
import { DEFAULT_BROWSER_FRAME_STATE, DEFAULT_EDITOR_FRAME_SETTINGS } from './constants';
import { hasSameEditorImageGeometry } from './image-geometry';
import type { EditorDocument } from './types';
function fixture(): EditorDocument {
  return {
    version: 2,
    sourceImageData: 'data:image/png;base64,YQ==',
    sourceName: null,
    sourceWidth: 100,
    sourceHeight: 80,
    canvasWidth: 100,
    canvasHeight: 80,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 100,
    sourceDisplayHeight: 80,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"objects":[]}',
  };
}
it('recognizes annotation-only changes, including a captured baseline without serialized source', () => {
  const before = fixture();
  const after = {
    ...before,
    canvasJson: JSON.stringify({
      objects: [
        {
          sniptaleType: 'source-image',
          width: 100,
          height: 80,
          angle: 0,
          originX: 'left',
          originY: 'top',
        },
        { type: 'rect', left: 10, top: 20 },
      ],
    }),
  };
  expect(hasSameEditorImageGeometry(before, after)).toBe(true);
});
it.each([
  { angle: 90 },
  { flipX: true },
  { cropX: 10 },
  { skewY: 5 },
  { visible: false },
  { src: 'data:image/png;base64,Yg==' },
  { width: 90 },
])('rejects source-object changes %j', (change) => {
  const before = fixture();
  const after = {
    ...before,
    canvasJson: JSON.stringify({ objects: [{ sniptaleRole: 'source', ...change }] }),
  };
  expect(hasSameEditorImageGeometry(before, after)).toBe(false);
});
it('rejects flattened, malformed, grouped and moved geometry', () => {
  const before = fixture();
  for (const change of [
    { sourceImageData: 'data:image/png;base64,Yg==' },
    { sourceLeft: 1 },
    { canvasJson: 'bad' },
    { canvasJson: '{"objects":[{"objects":[]}]}' },
  ])
    expect(hasSameEditorImageGeometry(before, { ...before, ...change })).toBe(false);
});
