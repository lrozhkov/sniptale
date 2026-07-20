import { describe, expect, it, vi } from 'vitest';
import type { EditorArrowSettings } from '../../../features/editor/document/types';
import { insertArrowPointGeometry } from './point-edit/insert';
import {
  getArrowPointRemovalIndex,
  getArrowPointRemovalIndexByDistance,
} from './point-edit/removal-index';
import { removeArrowPointGeometry } from './point-edit/remove';

function createSettings(overrides: Partial<EditorArrowSettings> = {}): EditorArrowSettings {
  return {
    color: '#ff671d',
    endHead: 'triangle',
    mode: 'straight',
    opacity: 1,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 4,
    ...overrides,
  };
}

function registerStraightInsertAndRemoveTest() {
  it('converts straight standard arrows into curves', () => {
    const updateArrowObject = vi.fn();
    const settings = createSettings();
    const currentPoints = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];

    insertArrowPointGeometry(
      {} as never,
      settings,
      currentPoints,
      { x: 4, y: 6 },
      updateArrowObject
    );
    expect(updateArrowObject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 6 },
          { x: 10, y: 0 },
        ],
        settings: expect.objectContaining({ mode: 'curve' }),
      })
    );
  });
}

function registerStraightRemovalTest() {
  it('removes the last internal bend by restoring straight mode', () => {
    const updateArrowObject = vi.fn();

    expect(
      removeArrowPointGeometry(
        {} as never,
        createSettings({ mode: 'curve' }),
        [
          { x: 0, y: 0 },
          { x: 4, y: 6 },
          { x: 10, y: 0 },
        ],
        1,
        updateArrowObject
      )
    ).toBe(true);
    expect(updateArrowObject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        settings: expect.objectContaining({ mode: 'straight' }),
      })
    );
  });
}

function registerTaperedInsertTest() {
  it('converts straight tapered arrows into curves', () => {
    const updateArrowObject = vi.fn();

    insertArrowPointGeometry(
      {} as never,
      createSettings({ variant: 'tapered' }),
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { x: 4, y: 6 },
      updateArrowObject
    );

    expect(updateArrowObject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 6 },
          { x: 10, y: 0 },
        ],
        settings: expect.objectContaining({ mode: 'curve' }),
      })
    );
  });
}

function registerCurveInsertTest() {
  it('inserts new bend points into the nearest segment for standard curve arrows', () => {
    const updateArrowObject = vi.fn();

    insertArrowPointGeometry(
      {} as never,
      createSettings({ mode: 'curve' }),
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 0 },
      ],
      { x: 8, y: 3 },
      updateArrowObject
    );

    expect(updateArrowObject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
          { x: 8, y: 3 },
          { x: 10, y: 0 },
        ],
      })
    );
  });
}

function registerTaperedRemovalIndexTest() {
  it('exposes removable internal points for tapered curve arrows', () => {
    const settings = createSettings({
      mode: 'curve',
      variant: 'tapered',
    });
    const currentPoints = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ];

    expect(getArrowPointRemovalIndex(settings, currentPoints, { x: 5, y: 5 })).toBe(1);
    expect(getArrowPointRemovalIndexByDistance(settings, currentPoints, { x: 5, y: 5 })).toBe(1);
  });
}

function registerCurveRemovalIndexTest() {
  it('finds removable internal points only for standard curve arrows', () => {
    const settings = createSettings({ mode: 'curve', width: 6 });
    const currentPoints = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ];

    expect(getArrowPointRemovalIndex(settings, currentPoints, { x: 5, y: 5 })).toBe(1);
    expect(getArrowPointRemovalIndexByDistance(settings, currentPoints, { x: 5, y: 5 })).toBe(1);
    expect(getArrowPointRemovalIndex(createSettings(), currentPoints, { x: 5, y: 5 })).toBe(-1);
  });
}

function registerRemoveBranchTest() {
  it('rejects endpoint removals and keeps curve mode when enough bends remain', () => {
    const updateArrowObject = vi.fn();
    const settings = createSettings({ mode: 'curve' });
    const currentPoints = [
      { x: 0, y: 0 },
      { x: 4, y: 6 },
      { x: 8, y: 6 },
      { x: 12, y: 0 },
    ];

    expect(
      removeArrowPointGeometry({} as never, settings, currentPoints, 0, updateArrowObject)
    ).toBe(false);
    expect(
      removeArrowPointGeometry({} as never, settings, currentPoints, 2, updateArrowObject)
    ).toBe(true);
    expect(updateArrowObject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 6 },
          { x: 12, y: 0 },
        ],
        settings: expect.objectContaining({ mode: 'curve' }),
      })
    );
  });
}

describe('object-factory arrow point-edit seam', () => {
  registerStraightInsertAndRemoveTest();
  registerStraightRemovalTest();
  registerTaperedInsertTest();
  registerCurveInsertTest();
  registerTaperedRemovalIndexTest();
  registerCurveRemovalIndexTest();
  registerRemoveBranchTest();
});
