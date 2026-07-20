import { beforeEach, expect, it, vi } from 'vitest';

import { appendScenarioStep, appendScenarioSuggestedEvent } from './append';
import { createScenarioProject } from './project';
import { createScenarioSectionStep } from './steps/index';

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

it('appends steps and suggested events immutably', () => {
  const project = createScenarioProject('Guide');
  const section = createScenarioSectionStep({ title: 'Section' });
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

  expect(project.steps).toEqual([]);
  expect(updatedProject.steps).toEqual([section]);
  expect(suggestedProject.suggestedEvents).toEqual([
    expect.objectContaining({ id: 'event-1', kind: 'click' }),
  ]);
});
