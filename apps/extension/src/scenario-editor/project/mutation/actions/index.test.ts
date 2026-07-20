import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ScenarioCaptureStep,
  ScenarioNoteStep,
  ScenarioProject,
  ScenarioSuggestedEvent,
} from '../../../../features/scenario/contracts/types/project';
import { createScenarioEditorProjectActions } from '.';

function createNoteStep(id = 'step-note', title = 'Note'): ScenarioNoteStep {
  return {
    id,
    kind: 'note',
    title,
    body: '',
    tone: 'neutral',
    createdAt: 1,
    updatedAt: 1,
  };
}

function createCaptureStep(id = 'step-capture'): ScenarioCaptureStep {
  return {
    id,
    kind: 'capture',
    title: 'Capture',
    body: '',
    assetId: 'asset-1',
    galleryAssetId: null,
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 100, height: 100 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    target: null,
    interactionPoint: null,
    cursorPoint: null,
    captureMetadata: {
      pointerRange: null,
      scroll: null,
      trigger: 'pointer-up',
    },
    overlays: [
      {
        id: 'overlay-1',
        kind: 'text',
        point: { x: 1, y: 2 },
        text: 'Overlay',
        color: '#000',
        fontSize: 12,
        fontFamily: 'system-ui',
        fontWeight: 400,
      },
    ],
    annotationRenderMode: 'overlays',
    imageTransform: { x: 0, y: 0, scale: 1 },
    viewportTransform: { x: 0, y: 0, width: 100, height: 100 },
    createdAt: 1,
    updatedAt: 1,
  };
}

function createSuggestedEvent(
  overrides: Partial<ScenarioSuggestedEvent> = {}
): ScenarioSuggestedEvent {
  return {
    id: 'event-1',
    kind: 'click',
    status: 'pending',
    createdAt: 1,
    message: 'Save project',
    sourceStepId: null,
    target: {
      selector: null,
      iframeSelector: null,
      tagName: null,
      role: null,
      text: 'Command palette',
      ariaLabel: null,
      title: null,
      rect: null,
      framePadding: null,
    },
    data: {},
    ...overrides,
  };
}

function createProject(overrides: Partial<ScenarioProject> = {}): ScenarioProject {
  return {
    id: 'project-1',
    name: 'Project',
    createdAt: 1,
    updatedAt: 1,
    version: 2,
    trash: [],
    suggestedEvents: [createSuggestedEvent()],
    steps: [createNoteStep(), createCaptureStep()],
    ...overrides,
  };
}

function createHarness(project = createProject()) {
  let currentProject = project;
  const selectedStepIds: Array<string | null> = [];
  const applyStepPatch = vi.fn();
  const applyStepReplacement = vi.fn();
  const setError = vi.fn();
  const actions = createScenarioEditorProjectActions({
    applyStepPatch,
    applyStepReplacement,
    getCurrentProject: () => currentProject,
    project: currentProject,
    setError,
    setSelectedStepId: (stepId) => {
      selectedStepIds.push(stepId);
    },
    updateProject: (updater) => {
      currentProject = updater(currentProject);
    },
  });

  return {
    actions,
    applyStepPatch,
    applyStepReplacement,
    setError,
    selectedStepIds,
    getProject: () => currentProject,
  };
}

function resetScenarioEditorControllerActionMocks() {
  vi.restoreAllMocks();
}

function verifiesStepInsertion() {
  const harness = createHarness();

  harness.actions.insertStep(1, 'section');
  harness.actions.insertStep(2, 'note');
  harness.actions.insertStep(3, 'divider');

  const insertedKinds = harness
    .getProject()
    .steps.slice(1, 4)
    .map((step) => step.kind);

  expect(insertedKinds).toEqual(['section', 'note', 'divider']);
  expect(harness.selectedStepIds).toHaveLength(3);
  expect(harness.selectedStepIds.every(Boolean)).toBe(true);
}

function verifiesStepUpdatesAndMoves() {
  vi.spyOn(Date, 'now').mockReturnValue(900);
  const harness = createHarness();

  harness.actions.updateStep('step-note', { title: 'Updated' });
  harness.actions.moveStepByOffset('step-note', 99);
  harness.actions.moveStepToPosition('step-capture', -5);
  harness.actions.moveStepByOffset('missing-step', 1);

  expect(harness.applyStepPatch).toHaveBeenCalledWith('step-note', { title: 'Updated' });
  expect(harness.getProject().steps.map((step) => step.id)).toEqual(['step-capture', 'step-note']);
  expect(harness.getProject().updatedAt).toBe(900);
}

function verifiesDeleteAndRestoreActions() {
  vi.spyOn(Date, 'now').mockReturnValue(300);
  const harness = createHarness();

  harness.actions.deleteStep('step-capture');
  expect(harness.getProject().steps.map((step) => step.id)).toEqual(['step-note']);
  expect(harness.getProject().trash.map((entry) => entry.step.id)).toEqual(['step-capture']);
  expect(harness.selectedStepIds).toEqual(['step-note']);

  harness.actions.restoreStep('step-capture');
  harness.actions.deleteStep('missing-step');
  harness.actions.restoreStep('missing-step');

  expect(harness.getProject().steps.map((step) => step.id)).toEqual(['step-note', 'step-capture']);
  expect(harness.getProject().trash).toEqual([]);
  expect(harness.selectedStepIds.at(-1)).toBe('step-capture');
}

function verifiesSuggestedEventActions() {
  const harness = createHarness(
    createProject({
      suggestedEvents: [createSuggestedEvent({ sourceStepId: 'step-note' })],
    })
  );

  harness.actions.acceptSuggestedEvent('event-1');
  harness.actions.dismissSuggestedEvent('event-1');
  harness.actions.acceptSuggestedEvent('missing-event');

  expect(harness.getProject().suggestedEvents[0]?.status).toBe('dismissed');
  expect(harness.getProject().steps[1]).toEqual(
    expect.objectContaining({
      kind: 'note',
      title: 'Save project',
      body: 'Command palette',
    })
  );
  expect(harness.selectedStepIds).toHaveLength(1);
}

describe('scenario editor controller actions', () => {
  beforeEach(() => {
    resetScenarioEditorControllerActionMocks();
  });

  describe('mutations', () => {
    it(
      'inserts section, note, and divider steps while selecting the inserted step',
      verifiesStepInsertion
    );
    it(
      'proxies step updates and clamps move operations into the valid range',
      verifiesStepUpdatesAndMoves
    );
    it(
      'moves deleted steps to trash and restores them with updated selection',
      verifiesDeleteAndRestoreActions
    );
    it(
      'accepts and dismisses suggested events while handling missing ids safely',
      verifiesSuggestedEventActions
    );
  });
});
