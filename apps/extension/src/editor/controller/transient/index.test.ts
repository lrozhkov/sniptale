// @vitest-environment jsdom

import { Point, Rect, Textbox } from 'fabric';
import { expect, it } from 'vitest';
import { completeEditorDrawSession } from '.';

const canvasDocumentSize = { height: 600, width: 800 };

it('discards missing and undersized drawing sessions', () => {
  expect(
    Reflect.apply(completeEditorDrawSession, null, [
      {
        canvasDocumentSize,
        drawSession: { object: null, start: new Point(0, 0), tool: 'pencil' },
        minDrawSize: 4,
      },
    ])
  ).toEqual({ drawSession: null, kind: 'discard' });

  expect(
    completeEditorDrawSession({
      canvasDocumentSize,
      drawSession: {
        object: new Rect({ height: 1, width: 1 }),
        objectId: 'shape-small',
        start: new Point(0, 0),
        tool: 'shape',
      },
      minDrawSize: 4,
    })
  ).toEqual({ drawSession: null, kind: 'discard' });
});

it('completes text, crop, and regular drawing sessions through their canonical outcomes', () => {
  const text = new Textbox('Text');
  const shape = new Rect({ height: 20, width: 30 });
  const crop = new Rect({ height: 40, left: 10, top: 20, width: 50 });

  expect(
    completeEditorDrawSession({
      canvasDocumentSize,
      drawSession: { object: text, objectId: 'text', start: new Point(0, 0), tool: 'text' },
      minDrawSize: 4,
    })
  ).toEqual(expect.objectContaining({ completedTool: 'text', kind: 'complete', object: text }));
  expect(
    completeEditorDrawSession({
      canvasDocumentSize,
      drawSession: { object: shape, objectId: 'shape', start: new Point(0, 0), tool: 'shape' },
      minDrawSize: 4,
    })
  ).toEqual(expect.objectContaining({ completedTool: 'shape', kind: 'complete', object: shape }));
  expect(
    completeEditorDrawSession({
      canvasDocumentSize,
      drawSession: { object: crop, objectId: 'crop', start: new Point(0, 0), tool: 'crop' },
      minDrawSize: 4,
    })
  ).toEqual(expect.objectContaining({ cropGuide: crop, kind: 'crop' }));
});
