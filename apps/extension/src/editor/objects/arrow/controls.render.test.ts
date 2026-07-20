import { Path } from 'fabric';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createArrowControlCursorHandler, createArrowControlRender } from './controls.render';
import { createArrowObject, setArrowEditMode } from './';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).arrow;

function createCanvasContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('tracks hover state and renders point and insert controls', () => {
  const arrow = new Path('M 0 0 L 10 10') as never;
  Object.assign(arrow, {
    canvas: { requestRenderAll: vi.fn() },
    sniptaleType: 'arrow',
  });
  const cursor = createArrowControlCursorHandler('p0', 'pointer');

  expect(cursor({} as never, {} as never, arrow, {} as never)).toBe('pointer');
  expect(
    (arrow as { canvas: { requestRenderAll: () => void } }).canvas.requestRenderAll
  ).toHaveBeenCalledOnce();

  const pointContext = createCanvasContext();
  createArrowControlRender('p0', 'point')(pointContext, 10, 12, {}, arrow);
  expect(pointContext.arc).toHaveBeenCalled();
  expect(pointContext.setLineDash).toHaveBeenCalledWith([]);

  const insertContext = createCanvasContext();
  createArrowControlRender('insert-0', 'insert')(insertContext, 14, 16, {}, arrow);
  expect(insertContext.moveTo).toHaveBeenCalled();
  expect(insertContext.lineTo).toHaveBeenCalled();
});

it('exposes point-edit controls for authored arrow routes', () => {
  const arrow = createArrowObject({
    id: 'arrow-render-controls',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 12 },
      { x: 60, y: 0 },
    ],
    settings: { ...settings, dynamicWidth: false, mode: 'curve', variant: 'standard' },
  });

  setArrowEditMode(arrow, true);
  const keys = Object.keys(arrow.controls);
  expect(keys).toEqual(['start', 'point-1', 'end', 'insert-0', 'insert-1']);
  const start = arrow.controls['start'];
  expect(start?.positionHandler?.(null as never, null as never, arrow, {} as never)).toBeDefined();
  expect(start?.actionHandler?.({} as never, { target: arrow } as never, 5, 6)).toBe(true);

  setArrowEditMode(arrow, false);
  expect(Object.keys(arrow.controls)).not.toContain('insert-0');

  const tapered = createArrowObject({
    id: 'arrow-render-tapered-controls',
    labelIndex: 2,
    points: [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
    ],
    settings: { ...settings, dynamicWidth: true, mode: 'straight', variant: 'tapered' },
  });
  setArrowEditMode(tapered, true);
  expect(Object.keys(tapered.controls)).toContain('insert-0');
});
