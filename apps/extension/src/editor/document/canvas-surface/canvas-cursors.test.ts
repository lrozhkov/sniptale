// @vitest-environment jsdom

import { Rect } from 'fabric';
import { afterEach, expect, it } from 'vitest';
import { createDrawingArrowControls } from '../../drawing/object/controls/arrow';
import { createDrawingBoxControls } from '../../drawing/object/controls/box';
import { applyEditorObjectInteractionControls } from '../../controller/document/interaction-controls/apply';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { EditorCanvas } from './render-region';

const cursorCanvases: EditorCanvas[] = [];
afterEach(async () => {
  await Promise.all(cursorCanvases.splice(0).map((canvas) => canvas.dispose()));
});

it('uses the selection cursor on unselected bodies and move only on the selected body', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 600, height: 400 });
  cursorCanvases.push(canvas);
  const object = new Rect({ left: 40, top: 40, width: 180, height: 120 });
  canvas.add(object);
  const hover = () =>
    canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: 80, clientY: 80 }));
  hover();
  expect(canvas.upperCanvasEl.style.cursor).toBe('default');
  canvas.setActiveObject(object);
  hover();
  expect(canvas.upperCanvasEl.style.cursor).toBe('move');
  canvas.selection = false;
  canvas.defaultCursor = 'crosshair';
  canvas.hoverCursor = 'crosshair';
  hover();
  expect(canvas.upperCanvasEl.style.cursor).toBe('crosshair');
});

it('refreshes the captured resize cursor after crossing either anchor outside the handle hit region', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), {
    width: 600,
    height: 400,
    uniformScaling: false,
  });
  cursorCanvases.push(canvas);
  const object = new Rect({
    originX: 'left',
    originY: 'top',
    left: 160,
    top: 140,
    width: 120,
    height: 80,
  });
  canvas.add(object);
  applyEditorObjectInteractionControls(object);
  canvas.setActiveObject(object);
  object.setCoords();
  const start = object.oCoords['br']!;
  canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: start.x, clientY: start.y }));
  expect(canvas.upperCanvasEl.style.cursor).toBe('nwse-resize');
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: start.x, clientY: start.y }));
  canvas.__onMouseMove(
    new MouseEvent('mousemove', { clientX: start.x + 5, clientY: start.y + 5, buttons: 1 })
  );
  canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: 110, clientY: 250, buttons: 1 }));
  expect(object.flipX).toBe(true);
  expect(object.flipY).toBe(false);
  expect(canvas.upperCanvasEl.style.cursor).toBe('nesw-resize');
  canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: 110, clientY: 90, buttons: 1 }));
  expect(object.flipX).toBe(true);
  expect(object.flipY).toBe(true);
  expect(canvas.upperCanvasEl.style.cursor).toBe('nwse-resize');
  canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: 330, clientY: 90, buttons: 1 }));
  expect(object.flipX).toBe(false);
  expect(object.flipY).toBe(true);
  expect(canvas.upperCanvasEl.style.cursor).toBe('nesw-resize');
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 330, clientY: 90 }));
});

it('updates the body cursor immediately after deferred click selection', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 600, height: 400 });
  cursorCanvases.push(canvas);
  const object = new Rect({
    originX: 'left',
    originY: 'top',
    left: 40,
    top: 40,
    width: 180,
    height: 120,
  });
  canvas.add(object);
  const point = { clientX: 90, clientY: 90 };
  canvas.__onMouseDown(new MouseEvent('mousedown', point));
  canvas.__onMouseUp(new MouseEvent('mouseup', point));
  expect(canvas.getActiveObject()).toBe(object);
  expect(canvas.upperCanvasEl.style.cursor).toBe('move');
});

it.each(['drawing', 'default'])('preserves grabbing through a captured %s rotation', (kind) => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 600, height: 400 });
  cursorCanvases.push(canvas);
  const object = new Rect({
    originX: 'left',
    originY: 'top',
    left: 160,
    top: 140,
    width: 120,
    height: 80,
  });
  canvas.add(object);
  if (kind === 'drawing') object.controls = createDrawingBoxControls(object);
  applyEditorObjectInteractionControls(object);
  canvas.setActiveObject(object);
  object.setCoords();
  const start = object.oCoords['mtr']!;
  canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: start.x, clientY: start.y }));
  expect(canvas.upperCanvasEl.style.cursor).toBe('grab');
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: start.x, clientY: start.y }));
  expect(canvas.upperCanvasEl.style.cursor).toBe('grabbing');
  canvas.__onMouseMove(
    new MouseEvent('mousemove', { clientX: start.x + 30, clientY: start.y + 70, buttons: 1 })
  );
  expect(object.angle).not.toBe(0);
  expect(canvas.upperCanvasEl.style.cursor).toBe('grabbing');
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: start.x + 30, clientY: start.y + 70 }));
});

it('preserves the arrow endpoint owner cursor while captured outside the endpoint hit region', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 600, height: 400 });
  cursorCanvases.push(canvas);
  const object = createEditorDrawingFabricObject(
    {
      kind: 'arrow',
      id: 'cursor-arrow',
      color: '#000',
      width: 8,
      dynamicWidth: false,
      start: { x: 160, y: 140 },
      end: { x: 280, y: 140 },
    },
    1
  );
  object.controls = createDrawingArrowControls();
  canvas.add(object);
  canvas.setActiveObject(object);
  object.setCoords();
  const start = object.oCoords['end']!;
  canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: start.x, clientY: start.y }));
  expect(canvas.upperCanvasEl.style.cursor).toBe('grab');
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: start.x, clientY: start.y }));
  expect(canvas.upperCanvasEl.style.cursor).toBe('grabbing');
  canvas.__onMouseMove(
    new MouseEvent('mousemove', { clientX: start.x + 80, clientY: start.y + 90, buttons: 1 })
  );
  expect(canvas.upperCanvasEl.style.cursor).toBe('grabbing');
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: start.x + 80, clientY: start.y + 90 }));
});
