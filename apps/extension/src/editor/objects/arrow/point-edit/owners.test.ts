import { describe, expect, it, vi } from 'vitest';
import type { EditorArrowSettings } from '../../../../features/editor/document/types';

import { findNearestInternalPointIndex, findNearestSegmentIndex } from './hit-testing';
import { insertArrowPointGeometry } from './insert';
import { removeArrowPointGeometry } from './remove';
import { getArrowPointRemovalIndex, getArrowPointRemovalIndexByDistance } from './removal-index';

function createSettings(overrides: Partial<EditorArrowSettings> = {}): EditorArrowSettings {
  return {
    color: '#ff671d',
    endHead: 'triangle',
    mode: 'curve',
    opacity: 1,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 4,
    ...overrides,
  };
}

function registerHitTestingTest() {
  it('keeps point hit-testing separate from geometry mutation', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ];

    expect(findNearestSegmentIndex(points, { x: 8, y: 3 })).toBe(1);
    expect(findNearestInternalPointIndex(points, { x: 5, y: 5 }, 1)).toBe(1);
    expect(findNearestInternalPointIndex(points, { x: 5, y: 8 }, 1)).toBe(-1);
  });
}

function registerMutationTest() {
  it('updates insertion and removal geometry through the supplied arrow updater', () => {
    const updateArrowObject = vi.fn();
    const arrow = {} as never;

    insertArrowPointGeometry(
      arrow,
      createSettings({ mode: 'straight' }),
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { x: 4, y: 6 },
      updateArrowObject
    );
    expect(updateArrowObject).toHaveBeenCalledWith(
      arrow,
      expect.objectContaining({ settings: expect.objectContaining({ mode: 'curve' }) })
    );
    expect(
      removeArrowPointGeometry(
        arrow,
        createSettings(),
        [
          { x: 0, y: 0 },
          { x: 4, y: 6 },
          { x: 10, y: 0 },
        ],
        1,
        updateArrowObject
      )
    ).toBe(true);
  });
}

function registerRemovalThresholdTest() {
  it('keeps removal hit thresholds owned by point-edit policy', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ];

    expect(getArrowPointRemovalIndex(createSettings(), points, { x: 5, y: 5 })).toBe(1);
    expect(getArrowPointRemovalIndexByDistance(createSettings(), points, { x: 5, y: 5 })).toBe(1);
    expect(
      getArrowPointRemovalIndex(createSettings({ mode: 'straight' }), points, { x: 5, y: 5 })
    ).toBe(-1);
  });
}

describe('arrow point-edit role owners', () => {
  registerHitTestingTest();
  registerMutationTest();
  registerRemovalThresholdTest();
});
