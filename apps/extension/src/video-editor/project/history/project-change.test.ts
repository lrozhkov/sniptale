import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoProjectCursorTrack } from '../../../features/video/project/defaults';
import { isHydratableVideoProject } from '../../../features/video/project/validation/root';
import type { VideoProject } from '../../../features/video/project/types';
import { applyVideoProjectHistoryChange, createVideoProjectHistoryChange } from './project-change';

function cursorProject(count = 10): VideoProject {
  const project = createEmptyVideoProject('Cursor history');
  project.duration = 5;
  project.cursorTrack = {
    ...createVideoProjectCursorTrack(),
    samples: Array.from({ length: count }, (_, index) => ({
      id: `cursor-${index}`,
      time: index / count,
      x: 0.4,
      y: 0.4,
      visible: true,
    })),
  };
  return project;
}

function restore(before: VideoProject, after: VideoProject) {
  const change = createVideoProjectHistoryChange(before, after);
  if (!change) throw new Error('Expected changed project');
  const restored = applyVideoProjectHistoryChange(after, change);
  expect({ ...restored, updatedAt: before.updatedAt }).toEqual(before);
  expect(isHydratableVideoProject(restored)).toBe(true);
  return { restored, change };
}

it('ignores timestamp-only and equal independently hydrated metadata', () => {
  const project = cursorProject();
  expect(
    createVideoProjectHistoryChange(project, { ...structuredClone(project), updatedAt: 999 })
  ).toBeNull();
  expect(() => createVideoProjectHistoryChange(project, { ...project, id: 'other' })).toThrow(
    'project'
  );
});

it('restores sparse cursor samples and skin without retaining the other captured observations', () => {
  const project = cursorProject(5000);
  const after = structuredClone(project);
  after.cursorTrack!.skin.color = '#123456';
  after.cursorTrack!.samples[2500]!.skinOverride = { ...after.cursorTrack!.skin, scale: 2 };
  const { restored, change } = restore(project, after);
  expect(JSON.stringify(change).length).toBeLessThan(1024);
  const reverse = createVideoProjectHistoryChange(after, restored)!;
  expect(applyVideoProjectHistoryChange(restored, reverse).cursorTrack).toEqual(after.cursorTrack);
});

it.each(['insert', 'remove'] as const)(
  'restores a middle cursor %s without retaining matching prefix and suffix',
  (kind) => {
    const project = cursorProject(5000);
    const after = structuredClone(project);
    if (kind === 'insert')
      after.cursorTrack!.samples.splice(2500, 0, {
        id: 'inserted',
        time: 0.5,
        x: 0.2,
        y: 0.2,
        visible: true,
      });
    else after.cursorTrack!.samples.splice(2500, 1);
    const { change } = restore(project, after);
    expect(JSON.stringify(change).length).toBeLessThan(1024);
  }
);

it('applies dense changed coordinates with bounded array copying', () => {
  const project = cursorProject(5000);
  const after = structuredClone(project);
  after.cursorTrack!.samples.forEach((sample) => {
    sample.x = 0.6;
  });
  const change = createVideoProjectHistoryChange(project, after)!;
  const copies = vi.spyOn(after.cursorTrack!.samples, 'slice');
  try {
    expect(applyVideoProjectHistoryChange(after, change).cursorTrack!.samples).toEqual(
      project.cursorTrack!.samples
    );
    expect(copies.mock.calls.length).toBeLessThanOrEqual(2);
  } finally {
    copies.mockRestore();
  }
});

it('restores optional field absence in both directions', () => {
  const before = { ...createEmptyVideoProject('Optional'), version: 36 as const };
  const after = { ...before, watermarkEnabled: false as const };
  const { restored } = restore(before, after);
  expect(restored).not.toHaveProperty('watermarkEnabled');
  restore(after, before);
});

it('isolates restored replacement values from the retained change', () => {
  const project = cursorProject();
  const after = { ...project, cursorTrack: null };
  const { restored, change } = restore(project, after);
  restored.cursorTrack!.skin.color = '#abcdef';
  expect(applyVideoProjectHistoryChange(after, change).cursorTrack).toEqual(project.cursorTrack);
  expect(after.cursorTrack).toBeNull();
});

it('restores an own prototype-named data field without changing the result prototype', () => {
  const project = {
    ...createEmptyVideoProject('Own keys'),
    ['__proto__']: { safe: true },
  };
  const { ['__proto__']: _ownData, ...after } = project;
  const { restored } = restore(project, after);
  expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
  expect(Object.hasOwn(restored, '__proto__')).toBe(true);
});
