import { Point } from 'fabric';
import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createLineObject, getLinePoints } from '../../objects/line';
import { updateEditorDrawSessionObject } from './';

const defaultShapeSettings = { strokeWidth: 4 } as never;
const defaultBlurSettings = { amount: 10, blurType: 'gaussian', showBorder: false } as never;
const defaultLineSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

it('updates dragged and click-mode line sessions through the line owner', () => {
  const line = createLineObject({
    id: 'line-1',
    labelIndex: 1,
    points: [
      { x: 5, y: 6 },
      { x: 5, y: 6 },
    ],
    settings: defaultLineSettings,
  });

  const result = updateEditorDrawSessionObject(
    {
      object: line,
      start: { x: 5, y: 6 },
      tool: 'line',
    } as never,
    new Point(20, 30),
    { color: '#fff', width: 4 } as never,
    defaultShapeSettings,
    defaultBlurSettings,
    false,
    { ...defaultLineSettings, style: 'dash' }
  );

  expect(result).toBeNull();
  expect(getLinePoints(line)).toEqual([
    { x: 5, y: 6 },
    { x: 20, y: 30 },
  ]);
  expect(line.sniptaleLinePointerMoved).toBe(true);
  expect(line.sniptaleLineSettings.style).toBe('dash');

  line.sniptaleLineClickMode = true;
  updateEditorDrawSessionObject(
    {
      object: line,
      start: { x: 5, y: 6 },
      tool: 'line',
    } as never,
    new Point(30, 35),
    { color: '#fff', width: 4 } as never,
    defaultShapeSettings,
    defaultBlurSettings
  );

  expect(getLinePoints(line).at(-1)).toEqual({ x: 30, y: 35 });
});

it('guards line drafts without line objects and falls back to the session start point', () => {
  expect(
    updateEditorDrawSessionObject(
      {
        object: { sniptaleType: 'rectangle' },
        start: { x: 5, y: 6 },
        tool: 'line',
      } as never,
      new Point(20, 30),
      { color: '#fff', width: 4 } as never,
      defaultShapeSettings,
      defaultBlurSettings
    )
  ).toBeNull();

  const line = createLineObject({
    id: 'line-2',
    labelIndex: 2,
    points: [
      { x: 5, y: 6 },
      { x: 5, y: 6 },
    ],
    settings: defaultLineSettings,
  });
  line.sniptaleLinePoints = [];
  line.sniptaleLinePointsJson = '';

  updateEditorDrawSessionObject(
    {
      object: line,
      start: { x: 5, y: 6 },
      tool: 'line',
    } as never,
    new Point(5, 7),
    { color: '#fff', width: 4 } as never,
    defaultShapeSettings,
    defaultBlurSettings
  );

  expect(getLinePoints(line)).toEqual([
    { x: 5, y: 6 },
    { x: 5, y: 7 },
  ]);
  expect(line.sniptaleLinePointerMoved).toBe(false);
});
