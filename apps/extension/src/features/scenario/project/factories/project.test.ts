import { beforeEach, expect, it, vi } from 'vitest';

import { createScenarioProject } from './project';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(500);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
});

it('creates a project with canonical defaults', () => {
  expect(createScenarioProject('Onboarding')).toEqual({
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
