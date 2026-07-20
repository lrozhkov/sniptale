// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioSectionStep,
} from '../../../features/scenario/project/public';
import type {
  ScenarioCaptureStep,
  ScenarioNoteStep,
  ScenarioProject,
  ScenarioStep,
  ScenarioSuggestedEvent,
} from '../../../features/scenario/contracts/types/project';
import {
  getScenarioMutationTimestamp,
  insertStepAt,
  moveStep,
  updateScenarioStep,
  updateSuggestedEvent,
} from './helpers';

function createNoteStep(): ScenarioNoteStep {
  return {
    id: 'step-1',
    kind: 'note',
    title: 'One',
    body: 'Body',
    tone: 'neutral',
    createdAt: 1,
    updatedAt: 1,
  };
}

function createCaptureStep(): ScenarioCaptureStep {
  return {
    ...createScenarioCaptureStep({
      assetId: 'asset-1',
      title: 'Two',
      body: 'Body',
    }),
    id: 'step-2',
  };
}

function createSuggestedEvent(): ScenarioSuggestedEvent {
  return {
    id: 'event-1',
    kind: 'click',
    status: 'pending',
    createdAt: 1,
    message: 'Event',
    sourceStepId: null,
    target: null,
    data: {},
  };
}

function createProject() {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project',
    createdAt: 1,
    updatedAt: 1,
    steps: [createNoteStep(), createCaptureStep()],
    trash: [],
    suggestedEvents: [createSuggestedEvent()],
  } satisfies ScenarioProject;
}

function resetScenarioEditorControllerHelpersMocks() {
  vi.restoreAllMocks();
}

function verifiesTimestampHelper() {
  vi.spyOn(Date, 'now').mockReturnValue(321);

  expect(getScenarioMutationTimestamp()).toBe(321);
}

function verifiesStepInsertionAndMove() {
  vi.spyOn(Date, 'now').mockReturnValue(500);
  const project = createProject();

  const inserted = insertStepAt(project, 1, {
    id: 'step-3',
    kind: 'note',
    title: 'Inserted',
    body: '',
    tone: 'neutral',
    updatedAt: 1,
  } as never);
  const moved = moveStep(inserted, 0, 2);

  expect(inserted.steps.map((step) => step.id)).toEqual(['step-1', 'step-3', 'step-2']);
  expect(moved.steps.map((step) => step.id)).toEqual(['step-3', 'step-2', 'step-1']);
  expect(moved.updatedAt).toBe(500);
}

function verifiesInvalidMoveIsNoop() {
  const project = createProject();

  expect(moveStep(project, 10, 0)).toBe(project);
}

function expectUpdatedCaptureStep(step: ScenarioStep) {
  expect(step.kind).toBe('capture');
  if (step.kind !== 'capture') {
    throw new Error('Expected capture step');
  }

  expect(step.title).toBe('Updated capture');
  expect(step.annotationRenderMode).toBe('asset');
}

function expectUpdatedNoteStep(step: ScenarioStep) {
  expect(step.kind).toBe('note');
  if (step.kind !== 'note') {
    throw new Error('Expected note step');
  }

  expect(step.tone).toBe('info');
}

function verifiesSuggestedEventAndStepUpdates() {
  vi.spyOn(Date, 'now').mockReturnValue(700);
  const project = createProject();
  const updatedProject = updateSuggestedEvent(project, 'event-1', (event) => ({
    ...event,
    message: 'Updated event',
  }));

  expect(updatedProject.suggestedEvents[0]?.message).toBe('Updated event');

  const captureStep = updateScenarioStep(project.steps[1] as ScenarioCaptureStep, {
    title: 'Updated capture',
    annotationRenderMode: 'asset',
    overlays: [
      {
        id: 'overlay-1',
        kind: 'text',
        point: { x: 1, y: 2 },
        text: 'A',
        color: '#000',
        fontSize: 12,
        fontFamily: 'system-ui',
        fontWeight: 400,
      },
    ],
  });
  const noteStep = updateScenarioStep(project.steps[0] as ScenarioNoteStep, {
    title: 'Updated note',
    tone: 'info',
  });
  const sectionStep = createScenarioSectionStep({
    title: 'Section',
    body: 'Body',
  });
  const genericStep = updateScenarioStep(sectionStep, { body: 'Updated body' }, 900);

  expectUpdatedCaptureStep(captureStep);
  expectUpdatedNoteStep(noteStep);
  expect(genericStep).toEqual(
    expect.objectContaining({
      body: '',
      updatedAt: 900,
    })
  );
}

function verifiesCapturePatchKeepsAnnotationModeOmittedWhenUnset() {
  const baseStep = createCaptureStep() as ScenarioCaptureStep & {
    annotationRenderMode?: ScenarioCaptureStep['annotationRenderMode'];
  };
  delete baseStep.annotationRenderMode;

  const captureStep = updateScenarioStep(baseStep, {
    title: 'Capture without annotation mode',
  });

  expect(captureStep.kind).toBe('capture');
  if (captureStep.kind !== 'capture') {
    throw new Error('Expected capture step');
  }

  expect(captureStep.annotationRenderMode).toBeUndefined();
}

function verifiesSectionNormalization() {
  const step = createScenarioSectionStep({
    title: 'Old heading',
    body: 'Hidden legacy caption',
  });

  expect(updateScenarioStep(step, { title: 'New heading' }, 42)).toEqual(
    expect.objectContaining({
      title: 'New heading',
      body: '',
      updatedAt: 42,
    })
  );
}

function runScenarioEditorControllerHelpersSuite() {
  beforeEach(resetScenarioEditorControllerHelpersMocks);

  it('returns mutation timestamps through the shared helper', verifiesTimestampHelper);
  it('inserts and moves steps while updating timestamps', verifiesStepInsertionAndMove);
  it('keeps invalid move requests as a no-op', verifiesInvalidMoveIsNoop);
  it(
    'updates suggested events and step patches across capture, note, and generic steps',
    verifiesSuggestedEventAndStepUpdates
  );
  it(
    'keeps capture annotation mode omitted when the patch does not provide it',
    verifiesCapturePatchKeepsAnnotationModeOmittedWhenUnset
  );
  it(
    'normalizes section steps to title-only content when patches are applied',
    verifiesSectionNormalization
  );
}

describe('scenario editor controller helpers', runScenarioEditorControllerHelpersSuite);
