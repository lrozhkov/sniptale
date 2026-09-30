import { expect, it } from 'vitest';
import {
  createMediaItem,
  createScenarioItem,
  createScenarioExportItem,
  createVideoProjectItem,
} from '../test-support/items';
import {
  buildGalleryKeyboardUnits,
  getGalleryNavigationIndex,
  getGalleryUnitRangeEndpoints,
  getGalleryVisibleScroll,
  getGalleryGridUnitBounds,
} from './keyboard-navigation';

it('uses the exact rendered order in list and expands collapsed grid groups for selection', () => {
  const webcam = createMediaItem({
    id: 'webcam',
    recordingGroupView: {
      groupId: 'group',
      memberCount: 2,
      order: 1,
      role: 'webcam',
      sourceLabel: 'Webcam',
      projectId: null,
    },
  });
  const display = createMediaItem({
    id: 'display',
    recordingGroupView: {
      groupId: 'group',
      memberCount: 2,
      order: 0,
      role: 'display',
      sourceLabel: 'Display',
      projectId: null,
    },
  });
  const middle = createMediaItem({ id: 'middle' });
  const project = createVideoProjectItem();
  const scenario = createScenarioItem();
  const exported = createScenarioExportItem();
  const items = [webcam, middle, display, project, scenario, exported];
  const list = buildGalleryKeyboardUnits(items, 'list');
  expect(list.map((unit) => unit.id)).toEqual([
    'display',
    'webcam',
    'middle',
    project.id,
    scenario.id,
    exported.id,
  ]);
  const grid = buildGalleryKeyboardUnits(items, 'compact-grid');
  expect(grid.map((unit) => unit.id)).toEqual([
    'webcam',
    'middle',
    project.id,
    scenario.id,
    exported.id,
  ]);
  expect(grid[0]?.selectableIds).toEqual(['display', 'webcam']);
  expect(grid[0]?.item).toBe(display);
  expect(getGalleryUnitRangeEndpoints(grid, 0, 2)).toEqual({
    anchorId: 'display',
    targetId: project.id,
  });
  expect(getGalleryUnitRangeEndpoints(grid, 2, 0)).toEqual({
    anchorId: project.id,
    targetId: 'display',
  });
  expect(getGalleryUnitRangeEndpoints(grid, 1, 0)).toEqual({
    anchorId: 'middle',
    targetId: 'display',
  });
  expect(getGalleryUnitRangeEndpoints(list, 0, 1)).toEqual({
    anchorId: 'display',
    targetId: 'webcam',
  });
});
it('moves by grid geometry without jumping sideways at the top or bottom row', () => {
  expect(getGalleryNavigationIndex('ArrowUp', 1, 8, 3)).toBe(1);
  expect(getGalleryNavigationIndex('ArrowDown', 1, 8, 3)).toBe(4);
  expect(getGalleryNavigationIndex('ArrowDown', 5, 8, 3)).toBe(7);
  expect(getGalleryNavigationIndex('ArrowDown', 6, 8, 3)).toBe(6);
  expect(getGalleryNavigationIndex('ArrowLeft', 3, 8, 3)).toBe(2);
  expect(getGalleryNavigationIndex('ArrowRight', 7, 8, 3)).toBe(7);
  expect(getGalleryNavigationIndex('Home', 7, 8, 3)).toBe(0);
  expect(getGalleryNavigationIndex('End', 0, 8, 3)).toBe(7);
  expect(getGalleryNavigationIndex('End', 0, 0, 3)).toBe(-1);
});
it('scrolls only enough to reveal a target below the sticky list header', () => {
  expect(
    getGalleryVisibleScroll({ top: 100, bottom: 160, scrollTop: 90, height: 500, stickyHeight: 48 })
  ).toBe(52);
  expect(
    getGalleryVisibleScroll({ top: 600, bottom: 660, scrollTop: 90, height: 500, stickyHeight: 48 })
  ).toBe(160);
  expect(
    getGalleryVisibleScroll({ top: 200, bottom: 260, scrollTop: 90, height: 500, stickyHeight: 48 })
  ).toBe(90);
  expect(
    getGalleryGridUnitBounds(
      4,
      { columnCount: 3, rowTops: [0, 200, 400], startRow: 0, totalRows: 2 },
      16
    )
  ).toEqual({ top: 216, bottom: 416 });
});
