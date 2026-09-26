// @vitest-environment jsdom

import { Canvas, FabricObject } from 'fabric';
import { expect, it, vi } from 'vitest';
import { readEditorDrawingObject } from '../metadata';
import { createEditorDrawingFabricObject } from '../vector';
import { createDrawingArrowControls } from './arrow';

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
