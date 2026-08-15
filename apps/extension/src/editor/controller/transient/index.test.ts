// @vitest-environment jsdom

import { Canvas, Point, Rect, Textbox } from 'fabric';
import { expect, it } from 'vitest';
import {
  cancelEditorCropDrawSession,
  clearEditorCropGuide,
  completeEditorDrawSession,
  startEditorDrawSession,
} from '.';

const canvasDocumentSize = { height: 600, width: 800 };

it('stores the initiating pointer in the canonical draw session', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const object = new Rect({ height: 20, width: 30 });
  object.sniptaleId = 'shape-pointer';

  const result = startEditorDrawSession({
    canvas,
    cropGuide: null,
    object,
    pointerId: 7,
    start: new Point(0, 0),
    tool: 'shape',
  });

  expect(result.drawSession.pointerId).toBe(7);
  canvas.dispose();
});

it('keeps crop cleanup and replacement inside the draw-session owner', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const cropGuide = new Rect({ height: 20, width: 30 });
  canvas.add(cropGuide);
  canvas.setActiveObject(cropGuide);

  expect(clearEditorCropGuide({ canvas, cropGuide: null }).changed).toBe(false);
  expect(clearEditorCropGuide({ canvas, cropGuide }).changed).toBe(true);
  expect(cancelEditorCropDrawSession({ canvas, drawSession: null }).changed).toBe(false);

  const cropDraft = new Rect({ height: 10, width: 10 });
  expect(
    cancelEditorCropDrawSession({
      canvas,
      drawSession: {
        object: cropDraft,
        objectId: 'crop-draft',
        pointerId: 7,
        start: new Point(0, 0),
        tool: 'crop',
      },
    }).changed
  ).toBe(true);

  const existingGuide = new Rect({ height: 20, width: 20 });
  canvas.add(existingGuide);
  canvas.setActiveObject(existingGuide);
  const replacement = startEditorDrawSession({
    canvas,
    cropGuide: existingGuide,
    object: new Rect({ height: 1, width: 1 }),
    start: new Point(0, 0),
    tool: 'crop',
  });
  expect(replacement.clearedExistingCropGuide).toBe(true);
  expect(replacement.drawSession.pointerId).toBeNull();
  canvas.dispose();
});

it('discards missing and undersized drawing sessions', () => {
  expect(
    Reflect.apply(completeEditorDrawSession, null, [
      {
        canvasDocumentSize,
        drawSession: { object: null, pointerId: null, start: new Point(0, 0), tool: 'pencil' },
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
        pointerId: null,
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
      drawSession: {
        object: text,
        objectId: 'text',
        pointerId: null,
        start: new Point(0, 0),
        tool: 'text',
      },
      minDrawSize: 4,
    })
  ).toEqual(expect.objectContaining({ completedTool: 'text', kind: 'complete', object: text }));
  expect(
    completeEditorDrawSession({
      canvasDocumentSize,
      drawSession: {
        object: shape,
        objectId: 'shape',
        pointerId: null,
        start: new Point(0, 0),
        tool: 'shape',
      },
      minDrawSize: 4,
    })
  ).toEqual(expect.objectContaining({ completedTool: 'shape', kind: 'complete', object: shape }));
  expect(
    completeEditorDrawSession({
      canvasDocumentSize,
      drawSession: {
        object: crop,
        objectId: 'crop',
        pointerId: null,
        start: new Point(0, 0),
        tool: 'crop',
      },
      minDrawSize: 4,
    })
  ).toEqual(expect.objectContaining({ cropGuide: crop, kind: 'crop' }));
});
