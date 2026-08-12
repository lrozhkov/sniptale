// @vitest-environment jsdom

import { ActiveSelection, Canvas } from 'fabric';
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
