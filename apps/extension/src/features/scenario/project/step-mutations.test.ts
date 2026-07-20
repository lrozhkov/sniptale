import { expect, it, vi } from 'vitest';
import { createScenarioCaptureStep, createScenarioNoteStep, createScenarioProject } from './public';
import {
  deleteScenarioStep,
  isCaptureScenarioStep,
  moveScenarioStep,
  restoreScenarioStep,
} from './step-mutations';

function createProjectFixture() {
  return {
    ...createScenarioProject('Scenario'),
    steps: [
      createScenarioCaptureStep({ assetId: 'asset-1', title: 'First' }),
      createScenarioNoteStep({ title: 'Second' }),
      createScenarioCaptureStep({ assetId: 'asset-2', title: 'Third' }),
    ],
  };
}

it('deletes matching steps and returns the original project when nothing matches', () => {
  vi.spyOn(Date, 'now').mockReturnValue(100);
  const project = createProjectFixture();

  const deleted = deleteScenarioStep(project, project.steps[1]!.id);
  const missing = deleteScenarioStep(project, 'missing');

  expect(deleted.deletedStep?.id).toBe(project.steps[1]!.id);
  expect(deleted.project.steps).toHaveLength(2);
  expect(deleted.project.updatedAt).toBe(100);
  expect(deleted.project.trash).toEqual([
    expect.objectContaining({
      originalIndex: 1,
      step: expect.objectContaining({ id: project.steps[1]!.id }),
    }),
  ]);
  expect(missing).toEqual({ deletedStep: null, project });
});

it('restores trashed steps at a bounded index and ignores missing trash entries', () => {
  vi.spyOn(Date, 'now').mockReturnValue(300);
  const project = createProjectFixture();
  const deleted = deleteScenarioStep(project, project.steps[1]!.id);
  const shiftedTrashProject = {
    ...deleted.project,
    trash: deleted.project.trash.map((entry) => ({
      ...entry,
      originalIndex: 99,
    })),
  };

  const restored = restoreScenarioStep(shiftedTrashProject, project.steps[1]!.id);

  expect(restored.restoredStep?.id).toBe(project.steps[1]!.id);
  expect(restored.project.steps.map((step) => step.id)).toEqual([
    project.steps[0]!.id,
    project.steps[2]!.id,
    project.steps[1]!.id,
  ]);
  expect(restored.project.trash).toEqual([]);
  expect(restored.project.updatedAt).toBe(300);
  expect(restoreScenarioStep(project, 'missing')).toEqual({
    project,
    restoredStep: null,
  });
});

it('replaces stale trash entries for the same step while preserving unrelated trash items', () => {
  vi.spyOn(Date, 'now').mockReturnValue(420);
  const project = createProjectFixture();
  const staleStep = project.steps[1]!;
  const unrelatedTrashedStep = createScenarioNoteStep({ title: 'Archived note' });
  const projectWithTrash = {
    ...project,
    trash: [
      {
        deletedAt: 11,
        originalIndex: 9,
        step: staleStep,
      },
      {
        deletedAt: 12,
        originalIndex: 0,
        step: unrelatedTrashedStep,
      },
    ],
  };

  const deleted = deleteScenarioStep(projectWithTrash, staleStep.id);
  const restored = restoreScenarioStep(deleted.project, staleStep.id);

  expect(deleted.project.trash).toEqual([
    {
      deletedAt: 420,
      originalIndex: 1,
      step: staleStep,
    },
    {
      deletedAt: 12,
      originalIndex: 0,
      step: unrelatedTrashedStep,
    },
  ]);
  expect(restored.project.trash).toEqual([
    {
      deletedAt: 12,
      originalIndex: 0,
      step: unrelatedTrashedStep,
    },
  ]);
});

it('narrows capture steps and reorders them with guard branches', () => {
  vi.spyOn(Date, 'now').mockReturnValue(200);
  const project = createProjectFixture();

  expect(isCaptureScenarioStep(project.steps[0]!)).toBe(true);
  expect(isCaptureScenarioStep(project.steps[1]!)).toBe(false);
  expect(moveScenarioStep(project, 'missing', 0)).toBe(project);
  expect(moveScenarioStep(project, project.steps[0]!.id, 0)).toBe(project);

  const moved = moveScenarioStep(project, project.steps[2]!.id, -10);

  expect(moved.steps.map((step) => step.id)).toEqual([
    project.steps[2]!.id,
    project.steps[0]!.id,
    project.steps[1]!.id,
  ]);
  expect(moved.updatedAt).toBe(200);
});
