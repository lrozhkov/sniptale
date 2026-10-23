// @vitest-environment jsdom

import { Canvas, FabricObject, Path, Point, type Transform } from 'fabric';
import { expect, it, vi } from 'vitest';
import { readEditorDrawingObject } from '../metadata';
import { createEditorDrawingFabricObject } from '../vector';
import {
  createDrawingArrowControls,
  updateEditorDrawingArrowHover,
  cancelEditorDrawingArrowBend,
} from './arrow';
import { createTypedTestFixture } from '../../../testing/fabric-canvas.test-support';
import { endEditorCanvasTransform } from '../../../controller/input/canvas-actions';
import { applyEditorDrawingInteractionControls } from './apply';
import { canonicalizeModifiedEditorDrawingSelection } from '../canonicalize';
import { nudgeEditorSelection } from '../../../controller/public-actions/selection/objects/nudge';

function createSelectedArrow() {
  const canvas = new Canvas(document.createElement('canvas'));
  const arrow = createEditorDrawingFabricObject(
    {
      color: '#f97316',
      dynamicWidth: false,
      end: { x: 140, y: 80 },
      id: 'arrow-marker',
      kind: 'arrow',
      start: { x: 40, y: 80 },
      width: 8,
    },
    1
  );
  applyEditorDrawingInteractionControls(arrow);
  canvas.add(arrow);
  canvas.setActiveObject(arrow);
  const position = (endpoint: 'start' | 'end') => {
    const control = arrow.controls[endpoint]!;
    return control.positionHandler(new Point(0, 0), [1, 0, 0, 1, 0, 0], arrow, control);
  };
  const renderedEnd = () => {
    if (!(arrow instanceof Path)) throw new Error('Expected an arrow path');
    const tip = arrow.path[3];
    if (!tip || tip[0] !== 'L') throw new Error('Expected a straight arrow tip');
    return new Point(tip[1], tip[2])
      .subtract(arrow.pathOffset)
      .transform(arrow.calcTransformMatrix());
  };
  const nudge = () =>
    nudgeEditorSelection({
      canvas,
      deltaX: 12,
      deltaY: 7,
      ensureObjectReachable: () => false,
      setSource: () => undefined,
      source: null,
      syncRuntimeState: () => undefined,
    });
  return { arrow, canvas, nudge, position, renderedEnd };
}

it('inserts a bend only after a drag and cancels its transform without a modified event', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const drawing = {
    kind: 'arrow' as const,
    id: 'bent',
    design: 'freehand' as const,
    start: { x: 20, y: 20 },
    end: { x: 220, y: 20 },
    color: '#f00',
    width: 12,
    dynamicWidth: false,
  };
  const arrow = createEditorDrawingFabricObject(drawing, 1);
  canvas.add(arrow);
  canvas.setActiveObject(arrow);
  applyEditorDrawingInteractionControls(arrow);
  const control = arrow.controls['bend-insert']!;
  expect(control.getVisibility(arrow, 'bend-insert')).toBe(false);
  updateEditorDrawingArrowHover(canvas, { x: 120, y: 20 });
  expect(control.getVisibility(arrow, 'bend-insert')).toBe(true);
  const transform = createTypedTestFixture<Transform>({ target: arrow, actionPerformed: false });
  const event = new MouseEvent('mousemove');
  control.mouseDownHandler!(event, transform, 120, 20);
  expect(control.actionHandler(event, transform, 120, 22)).toBe(false);
  expect(readEditorDrawingObject(arrow)).toEqual(drawing);
  expect(control.actionHandler(event, transform, 120, 100)).toBe(true);
  expect(readEditorDrawingObject(arrow)).toMatchObject({ bendPoints: [{ x: 120, y: 100 }] });
  expect(canvas.upperCanvasEl.style.cursor).toBe('none');
  const modified = vi.fn();
  canvas.on('object:modified', modified);
  canvas._currentTransform = transform;
  transform.actionPerformed = true;
  expect(endEditorCanvasTransform(canvas)).toBe(true);
  expect(canvas._currentTransform).toBeNull();
  expect(readEditorDrawingObject(arrow)).toEqual(drawing);
  expect(modified).not.toHaveBeenCalled();
  expect(cancelEditorDrawingArrowBend(canvas)).toBe(false);
  expect(canvas.upperCanvasEl.style.cursor).not.toBe('none');
  canvas.dispose();
});

it('clears insertion chrome when the pointer leaves after selection has been cleared', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const arrow = createEditorDrawingFabricObject(
    {
      kind: 'arrow',
      id: 'hover',
      design: 'freehand',
      start: { x: 20, y: 20 },
      end: { x: 220, y: 20 },
      color: '#f00',
      width: 12,
      dynamicWidth: false,
    },
    1
  );
  canvas.add(arrow);
  canvas.setActiveObject(arrow);
  applyEditorDrawingInteractionControls(arrow);
  const insert = arrow.controls['bend-insert']!;
  updateEditorDrawingArrowHover(canvas, { x: 120, y: 20 });
  expect(insert.getVisibility(arrow, 'bend-insert')).toBe(true);
  canvas.discardActiveObject();
  updateEditorDrawingArrowHover(canvas, null);
  canvas.setActiveObject(arrow);
  expect(insert.getVisibility(arrow, 'bend-insert')).toBe(false);
  canvas.dispose();
});

it('publishes one Fabric modified event for a native bend-control drag', () => {
  const canvas = new Canvas(document.createElement('canvas'), { width: 400, height: 240 });
  document.body.append(canvas.wrapperEl);
  vi.spyOn(canvas.upperCanvasEl, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 240)
  );
  const arrow = createEditorDrawingFabricObject(
    {
      kind: 'arrow',
      id: 'native',
      design: 'freehand',
      start: { x: 20, y: 20 },
      end: { x: 220, y: 20 },
      color: '#f00',
      width: 12,
      dynamicWidth: false,
    },
    1
  );
  canvas.add(arrow);
  canvas.setActiveObject(arrow);
  applyEditorDrawingInteractionControls(arrow);
  updateEditorDrawingArrowHover(canvas, { x: 120, y: 20 });
  const modified = vi.fn();
  canvas.on('object:modified', modified);
  canvas.on('object:modified', ({ target }) =>
    canonicalizeModifiedEditorDrawingSelection({
      canvas,
      object: target,
      source: null,
      prepareObject: applyEditorDrawingInteractionControls,
    })
  );
  canvas.upperCanvasEl.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1, clientX: 120, clientY: 20 })
  );
  expect(canvas._currentTransform?.corner).toBe('bend-insert');
  document.dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 120, clientY: 100 })
  );
  expect(canvas._currentTransform?.actionPerformed).toBe(true);
  document.dispatchEvent(
    new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 120, clientY: 100 })
  );
  expect(modified).toHaveBeenCalledTimes(1);
  expect(readEditorDrawingObject(arrow)).toMatchObject({ bendPoints: [{ x: 120, y: 100 }] });
  canvas.dispose();
});

it('moves both arrow markers exactly once with a keyboard nudge', () => {
  const { canvas, nudge, position, renderedEnd } = createSelectedArrow();
  const beforeStart = position('start');
  const beforeEnd = position('end');

  expect(nudge()).toBe(true);
  expect(position('start').x).toBeCloseTo(beforeStart.x + 12);
  expect(position('start').y).toBeCloseTo(beforeStart.y + 7);
  expect(position('end').x).toBeCloseTo(beforeEnd.x + 12);
  expect(position('end').y).toBeCloseTo(beforeEnd.y + 7);
  expect(position('end').x).toBeCloseTo(renderedEnd().x);
  expect(position('end').y).toBeCloseTo(renderedEnd().y);
  canvas.dispose();
});

it('keeps the opposite marker fixed while dragging an endpoint after a nudge', () => {
  const { arrow, canvas, nudge, position, renderedEnd } = createSelectedArrow();
  const originalStart = position('start');
  nudge();
  const endControl = arrow.controls['end']!;

  expect(
    endControl.actionHandler!(new MouseEvent('mousemove'), { target: arrow } as never, 180, 105)
  ).toBe(true);
  expect(position('start').x).toBeCloseTo(originalStart.x + 12);
  expect(position('start').y).toBeCloseTo(originalStart.y + 7);
  expect(position('end').x).toBeCloseTo(180);
  expect(position('end').y).toBeCloseTo(105);
  expect(position('end').x).toBeCloseTo(renderedEnd().x);
  expect(position('end').y).toBeCloseTo(renderedEnd().y);
  canvas.dispose();
});

it('provides exactly two grab endpoints for drawing arrows', () => {
  const controls = createDrawingArrowControls();

  expect(Object.keys(controls)).toEqual(['start', 'end']);
  expect(controls['start']?.cursorStyle).toBe('grab');
  expect(controls['end']?.cursorStyle).toBe('grab');
});

it('shows a closed hand immediately after pressing either endpoint', () => {
  const cursor = vi.fn();
  const object = new FabricObject();
  object.canvas = { setCursor: cursor } as never;
  const controls = createDrawingArrowControls();
  for (const endpoint of ['start', 'end']) {
    controls[endpoint]?.mouseDownHandler?.({} as never, { target: object } as never, 0, 0);
    expect(cursor).toHaveBeenLastCalledWith('grabbing');
  }
});

it.each(['start', 'end'] as const)(
  'moves the %s endpoint freely and snaps only with Shift',
  (endpoint) => {
    const canvas = new Canvas(document.createElement('canvas'));
    const arrow = createEditorDrawingFabricObject(
      {
        color: '#f97316',
        dynamicWidth: false,
        end: { x: 140, y: 80 },
        id: 'arrow-1',
        kind: 'arrow',
        start: { x: 40, y: 80 },
        width: 8,
      },
      1
    );
    canvas.add(arrow);
    const control = createDrawingArrowControls()[endpoint]!;
    const moved = control.actionHandler!(
      new MouseEvent('mousemove'),
      { target: arrow } as never,
      endpoint === 'start' ? 42 : 240,
      84
    );
    expect(moved).toBe(true);
    const free = readEditorDrawingObject(arrow);
    expect(free?.kind).toBe('arrow');
    if (free?.kind === 'arrow') {
      expect(free[endpoint].y).not.toBe(free[endpoint === 'start' ? 'end' : 'start'].y);
    }
    const snapped = control.actionHandler!(
      new MouseEvent('mousemove', { shiftKey: true }),
      { target: arrow } as never,
      endpoint === 'start' ? 42 : 240,
      84
    );
    expect(snapped).toBe(true);
    const aligned = readEditorDrawingObject(arrow);
    if (aligned?.kind === 'arrow') {
      expect(aligned.start.y).toBeCloseTo(aligned.end.y, 4);
    }
    canvas.dispose();
  }
);
