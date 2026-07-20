import { describe, expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createArrowObject, setArrowEditMode } from './';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).arrow;

describe('arrow point control selection state', () => {
  it('switches between resize handles, authored point controls, and elbow segment controls', () => {
    const arrow = createArrowObject({
      id: 'arrow-controls',
      labelIndex: 1,
      points: [
        { x: 0, y: 0 },
        { x: 24, y: 12 },
        { x: 48, y: 0 },
      ],
      settings: { ...settings, arrowType: 'sharp', mode: 'curve', dynamicWidth: false },
    });

    expect(Object.keys(arrow.controls).length).toBeGreaterThan(0);
    setArrowEditMode(arrow, true);
    expect(Object.keys(arrow.controls)).toEqual([
      'start',
      'point-1',
      'end',
      'insert-0',
      'insert-1',
    ]);

    const elbow = createArrowObject({
      id: 'arrow-elbow-controls',
      labelIndex: 2,
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 30 },
        { x: 80, y: 30 },
      ],
      settings: {
        ...settings,
        arrowType: 'elbow',
        dynamicWidth: false,
        mode: 'straight',
        variant: 'standard',
      },
    });
    setArrowEditMode(elbow, true);

    expect(Object.keys(elbow.controls).some((key) => key.startsWith('segment-'))).toBe(true);
    expect(Object.keys(elbow.controls).some((key) => key.startsWith('insert-'))).toBe(false);
  });
});
