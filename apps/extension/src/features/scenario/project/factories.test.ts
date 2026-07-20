import { beforeEach, expect, it, vi } from 'vitest';
import {
  appendScenarioStep,
  appendScenarioSuggestedEvent,
  createScenarioCaptureStep,
  createScenarioDividerStep,
  createScenarioNoteStep,
  createScenarioProject,
  createScenarioSectionStep,
} from './factories';
import { createDefaultScenarioPageDescriptor } from './defaults';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(500);
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    (() => {
      let index = 0;
      return () => `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}`;
    })()
  );
});

it('creates a project with defaults', () => {
  const project = createScenarioProject('Onboarding');

  expect(project).toEqual({
    version: 2,
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Onboarding',
    createdAt: 500,
    updatedAt: 500,
    steps: [],
    trash: [],
    suggestedEvents: [],
    tags: [],
  });
});

it('creates the default page descriptor and capture step defaults', () => {
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
  });

  expect(createDefaultScenarioPageDescriptor()).toEqual({
    title: null,
    url: null,
    viewport: { x: 0, y: 0, width: 720, height: 420 },
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
  });
  expect(step).toEqual(
    expect.objectContaining({
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'capture',
      assetId: 'asset-1',
      captureSurface: 'visible',
      sourceKind: 'manual',
      overlays: [],
      imageTransform: { scale: 1, x: 0, y: 0 },
      viewportTransform: { x: 0, y: 0, width: 720, height: 420 },
    })
  );
});

it('creates text steps and immutable append operations', () => {
  const project = createScenarioProject('Guide');
  const section = createScenarioSectionStep({ title: 'Section' });
  const note = createScenarioNoteStep({ title: 'Note', tone: 'warning' });
  const divider = createScenarioDividerStep();
  const updatedProject = appendScenarioStep(project, section);
  const suggestedProject = appendScenarioSuggestedEvent(updatedProject, {
    id: 'event-1',
    kind: 'click',
    status: 'pending',
    createdAt: 501,
    message: 'Clicked',
    sourceStepId: null,
    target: null,
    data: {},
  });

  expect(note.tone).toBe('warning');
  expect(divider.kind).toBe('divider');
  expect(updatedProject.steps).toEqual([section]);
  expect(project.steps).toEqual([]);
  expect(suggestedProject.suggestedEvents).toEqual([
    expect.objectContaining({ id: 'event-1', kind: 'click' }),
  ]);
});
