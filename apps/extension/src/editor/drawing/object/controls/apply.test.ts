// @vitest-environment jsdom

import { ActiveSelection, Canvas, Group, Point, Rect } from 'fabric';
import { expect, it } from 'vitest';
import { createEditorDrawingFabricObject } from '../vector';
import {
  applyEditorDrawingActiveSelectionChrome,
  applyEditorDrawingInteractionControls,
} from './apply';

it('routes arrow drawings to endpoint controls without a bounding box', () => {
  const object = createEditorDrawingFabricObject(
    {
      color: '#f97316',
      dynamicWidth: true,
      end: { x: 120, y: 60 },
      id: 'arrow-1',
      kind: 'arrow',
      start: { x: 10, y: 10 },
      width: 18,
    },
    1
  );

  applyEditorDrawingInteractionControls(object);

  expect(Object.keys(object.controls)).toEqual(['start', 'end']);
  expect(object.hasBorders).toBe(false);
  expect(object.lockRotation).toBe(true);
});

it('targets a diagonal arrow near its visible stroke without claiming empty bounding-box corners', () => {
  const canvas = new Canvas(document.createElement('canvas'), { targetFindTolerance: 5 });
  canvas.setDimensions({ width: 240, height: 220 });
  canvas.upperCanvasEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 240, height: 220 }) as DOMRect;
  const arrow = createEditorDrawingFabricObject(
    {
      color: '#f97316',
      dynamicWidth: false,
      end: { x: 180, y: 160 },
      id: 'arrow-diagonal',
      kind: 'arrow',
      start: { x: 40, y: 40 },
      width: 12,
    },
    1
  );
  applyEditorDrawingInteractionControls(arrow);
  canvas.add(arrow);
  arrow.setCoords();
  const origin = canvas.getScenePoint(new MouseEvent('mousemove', { clientX: 0, clientY: 0 }));
  const targetAt = (x: number, y: number) =>
    canvas.findTarget(new MouseEvent('mousemove', { clientX: x - origin.x, clientY: y - origin.y }))
      .target;

  expect(arrow.containsPoint(new Point(50, 150))).toBe(true);
  expect(arrow.perPixelTargetFind).toBe(true);

  expect(targetAt(110, 100)).toBe(arrow);
  expect(targetAt(110, 108)).toBe(arrow);
  expect(targetAt(50, 150)).toBeUndefined();

  canvas.setActiveObject(arrow);
  canvas.targetFindTolerance = 0;
  expect(targetAt(40, 32)).toBe(arrow);
  canvas.dispose();
});

it('applies drawing chrome without box controls to drawing multi-selection', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const first = createEditorDrawingFabricObject(
    {
      bounds: { height: 80, width: 120, x: 10, y: 20 },
      color: '#111111',
      fillColor: null,
      id: 'shape-1',
      kind: 'rectangle',
      width: 4,
    },
    1
  );
  const second = createEditorDrawingFabricObject(
    {
      bounds: { height: 80, width: 80, x: 180, y: 20 },
      color: '#111111',
      fillColor: null,
      id: 'shape-2',
      kind: 'ellipse',
      width: 4,
    },
    2
  );
  canvas.add(first, second);
  const selection = new ActiveSelection([first, second], { canvas });

  applyEditorDrawingActiveSelectionChrome(selection);

  expect(selection.borderColor).toBe('#2563eb');
  expect(selection.borderDashArray).toEqual([4, 3]);
  expect(selection.hasControls).toBe(false);
  canvas.dispose();
});

it('uses the blue drawing selection chrome for an editable layer group', () => {
  const group = new Group([new Rect({ width: 40, height: 30 })]);
  group.sniptaleType = 'group';
  group.borderColor = '#f97316';

  applyEditorDrawingInteractionControls(group);

  expect(group.borderColor).toBe('#2563eb');
  expect(group.cornerStrokeColor).toBe('#2563eb');
  expect(group.borderDashArray).toEqual([4, 3]);
  expect(group.hasControls).toBe(true);
});
