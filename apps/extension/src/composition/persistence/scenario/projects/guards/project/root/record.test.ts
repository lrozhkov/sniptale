import { expect, it } from 'vitest';

import { isPersistedScenarioProjectRecord } from './record';

it('accepts persisted project records with optional trash', () => {
  expect(
    isPersistedScenarioProjectRecord({
      createdAt: 1,
      id: 'project-1',
      name: 'Recorded flow',
      suggestedEvents: [],
      steps: [],
      updatedAt: 2,
    })
  ).toBe(true);
});

it('rejects malformed root records', () => {
  expect(
    isPersistedScenarioProjectRecord({
      createdAt: 'now',
      id: 'project-1',
      name: 'Broken',
      suggestedEvents: [],
      steps: [],
      updatedAt: 2,
    } as Record<string, unknown>)
  ).toBe(false);
});
