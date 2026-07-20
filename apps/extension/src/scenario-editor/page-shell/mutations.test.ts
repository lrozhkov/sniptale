import { afterEach, expect, it, vi } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioShapeElement,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  addProjectSlide,
  addSlideElement,
  deleteProjectSlide,
  deleteSlideElement,
  duplicateProjectSlide,
  moveProjectSlide,
  moveSlideElement,
  replaceProjectSlide,
  updateProjectPresentationSettings,
  updateSlideElement,
  updateSlideSettings,
} from './mutations';

function createProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Scenario');
  const text = { ...createScenarioTextElement({ text: 'Title' }), id: 'text-1' };
  const image = { ...createScenarioImageElement(), id: 'image-1' };
  return {
    ...project,
    slides: [
      { ...project.slides[0]!, elements: [text, image], id: 'slide-1', title: 'First' },
      { ...project.slides[0]!, elements: [], id: 'slide-2', title: 'Second' },
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('adds, duplicates, moves, replaces, and deletes slides with history-safe copies', () => {
  vi.spyOn(Date, 'now').mockReturnValue(100);
  const project = createProject();
  const added = addProjectSlide(project);
  const duplicated = duplicateProjectSlide(added, 'slide-1');
  const moved = moveProjectSlide(duplicated, 'slide-1', 'down');
  const replacement = { ...moved.slides[0]!, id: 'replacement', title: 'Replacement' };
  const replaced = replaceProjectSlide(moved, moved.slides[0]!.id, replacement);
  const deleted = deleteProjectSlide(replaced, 'replacement');

  expect(added.slides).toHaveLength(3);
  expect(duplicated.slides[1]?.title).toBe('First copy');
  expect(moved.slides[1]?.id).toBe('slide-1');
  expect(replaced.slides[0]?.id).toBe('replacement');
  expect(deleted.trash[0]).toMatchObject({ originalIndex: 0 });
});

it('keeps invalid slide mutations as no-ops', () => {
  const project = { ...createProject(), slides: [createProject().slides[0]!] };

  expect(deleteProjectSlide(project, 'slide-1')).toBe(project);
  expect(deleteProjectSlide(project, 'missing')).toBe(project);
  expect(duplicateProjectSlide(project, 'missing')).toBe(project);
  expect(moveProjectSlide(project, 'slide-1', 'up')).toBe(project);
});

it('adds, moves, updates, and deletes slide elements', () => {
  vi.spyOn(Date, 'now').mockReturnValue(200);
  const project = createProject();
  const shape = { ...createScenarioShapeElement(), id: 'shape-1' };
  const added = addSlideElement(project, 'slide-1', shape);
  const moved = moveSlideElement(added, 'slide-1', 'shape-1', 'backward');
  const updated = updateSlideElement(moved, 'slide-1', 'image-1', {
    contentTransform: { scale: 1.4, x: 12 },
    frame: { width: 360 },
  });
  const deleted = deleteSlideElement(updated, 'slide-1', 'text-1');

  expect(moved.slides[0]?.elements[1]?.id).toBe('shape-1');
  expect(updated.slides[0]?.elements.find((element) => element.id === 'image-1')).toMatchObject({
    contentTransform: { scale: 1.4, x: 12, y: 0 },
    frame: expect.objectContaining({ width: 360 }),
  });
  expect(deleted.slides[0]?.elements.map((element) => element.id)).not.toContain('text-1');
});

it('keeps invalid element and slide setting mutations as no-ops', () => {
  const project = createProject();

  expect(deleteSlideElement(project, 'slide-1', 'missing')).toBe(project);
  expect(moveSlideElement(project, 'slide-1', 'text-1', 'backward')).toBe(project);
  expect(updateSlideElement(project, 'missing', 'text-1', { name: 'Nope' })).toBe(project);
  expect(updateSlideSettings(project, 'missing', { title: 'Nope' })).toBe(project);
});

it('updates slide settings with nested canvas patches', () => {
  const project = createProject();
  const updated = updateSlideSettings(project, 'slide-1', {
    canvas: { background: { color: '#111111', kind: 'solid' }, height: 800 },
    notes: 'Speaker notes',
  });

  expect(updated.slides[0]).toMatchObject({
    canvas: { background: { color: '#111111', kind: 'solid' }, height: 800 },
    notes: 'Speaker notes',
  });
});

it('updates project presentation defaults with nested controls and grid patches', () => {
  vi.spyOn(Date, 'now').mockReturnValue(300);
  const project = createProject();
  const updated = updateProjectPresentationSettings(project, {
    controls: { loop: true, showControls: false },
    defaultLayoutId: 'summary',
    grid: { columns: 8, gutter: 20 },
    themeId: 'graphite',
  });

  expect(updated.presentation).toMatchObject({
    controls: { loop: true, showControls: false },
    defaultLayoutId: 'summary',
    grid: { columns: 8, gutter: 20 },
    themeId: 'graphite',
  });
  expect(updated.updatedAt).toBe(300);
  expect(project.presentation.themeId).not.toBe('graphite');
});
