// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createLineObject } from '..';
import { createLineControls } from './factory';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

it('creates point controls and open-line midpoint controls from line metadata', () => {
  const line = createLineObject({
    id: 'line-open-controls',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
    ],
    settings,
  });

  expect(Object.keys(createLineControls(line, vi.fn()))).toEqual(['p0', 'p1', 'p2', 'm0', 'm1']);
});

it('creates wrapping midpoint controls for closed lines', () => {
  const line = createLineObject({
    id: 'line-closed-controls',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
    ],
    settings,
    closed: true,
  });

  expect(Object.keys(createLineControls(line, vi.fn()))).toEqual([
    'p0',
    'p1',
    'p2',
    'm0',
    'm1',
    'm2',
  ]);
});
