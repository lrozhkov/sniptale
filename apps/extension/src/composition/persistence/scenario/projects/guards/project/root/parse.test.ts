import { expect, it, vi } from 'vitest';

import { parseScenarioProject } from './parse';

it('parses legacy persisted project records with optional trash', () => {
  expect(
    parseScenarioProject({
      createdAt: 1,
      id: 'project-1',
      name: 'Recorded flow',
      suggestedEvents: [],
      steps: [],
      updatedAt: 2,
    })
  ).toEqual(
    expect.objectContaining({
      createdAt: 1,
      id: 'project-1',
      name: 'Recorded flow',
      steps: [],
      suggestedEvents: [],
      trash: [],
      updatedAt: 2,
      version: 2,
    })
  );
});

it('rejects malformed persisted project records early', () => {
  expect(
    parseScenarioProject({
      createdAt: 'now',
      id: 'project-1',
      name: 'Broken',
      suggestedEvents: [],
      steps: [],
      updatedAt: 2,
    } as Record<string, unknown>)
  ).toBeNull();

  expect(
    parseScenarioProject({
      createdAt: 1,
      id: 'project-2',
      name: 'Legacy',
      suggestedEvents: [],
      steps: [],
      trash: 'invalid',
      updatedAt: 2,
    } as Record<string, unknown>)
  ).toBeNull();
});

it('warns when persisted project content is partially dropped during parse', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  expect(
    parseScenarioProject({
      createdAt: 1,
      id: 'project-3',
      name: 'Partially broken',
      suggestedEvents: [{ id: 5 }],
      steps: [{ id: 'step-1', kind: 'unsupported' }],
      trash: [{ id: 7 }],
      updatedAt: 2,
    })
  ).toEqual(
    expect.objectContaining({
      id: 'project-3',
      steps: [],
      suggestedEvents: [],
      trash: [],
    })
  );

  expect(warnSpy).toHaveBeenCalledWith(
    '[SharedScenarioProjectParse]',
    'Dropped invalid scenario project content while parsing persisted project',
    expect.objectContaining({
      droppedSteps: 1,
      droppedSuggestedEvents: 1,
      droppedTrashEntries: 1,
      projectId: 'project-3',
    })
  );
});
