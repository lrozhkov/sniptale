import { expect, it } from 'vitest';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/public';
import { parseScenarioProjectEntry, parseScenarioProjectSummary } from './read-guards';

it('retains template purpose for catalog routing even when content needs recovery', () => {
  const project = {
    ...createGuideProject('Template', 'template', 1),
    purpose: 'step-template' as const,
    items: [createGuideStep('', 'step')],
  };
  const entry = { id: project.id, project, createdAt: 1, updatedAt: 1, workspaceRevision: 1 };
  expect(parseScenarioProjectEntry(entry)?.project.purpose).toBe('step-template');
  expect(parseScenarioProjectSummary(entry)).toMatchObject({
    purpose: 'step-template',
    availability: 'available',
  });
  const invalid = { ...entry, project: { ...project, items: [] } };
  expect(parseScenarioProjectEntry(invalid)).toBeNull();
  expect(parseScenarioProjectSummary(invalid)).toMatchObject({
    purpose: 'step-template',
    availability: 'invalid',
  });
});
