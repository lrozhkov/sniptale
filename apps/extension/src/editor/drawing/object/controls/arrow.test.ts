// @vitest-environment jsdom

import { Canvas, FabricObject, Path, Point } from 'fabric';
import { expect, it, vi } from 'vitest';
import { readEditorDrawingObject } from '../metadata';
import { createEditorDrawingFabricObject } from '../vector';
import { createDrawingArrowControls } from './arrow';
import { applyEditorDrawingInteractionControls } from './apply';
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
