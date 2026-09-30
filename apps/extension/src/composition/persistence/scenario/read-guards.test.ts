import { expect, it } from 'vitest';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/public';
import {
  parseScenarioProjectEntry,
  parseScenarioProjectSummary,
  parseScenarioExportEntry,
} from './read-guards';

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

it('preserves independent export Trash metadata through the canonical decoder and rejects malformed states', () => {
  const legacy = {
    id: 'export',
    projectId: 'project',
    format: 'html',
    filename: 'guide.html',
    createdAt: 1,
    size: 42,
  };
  expect(parseScenarioExportEntry(legacy)).toEqual(legacy);
  const trashed = { ...legacy, trashState: { updatedAt: 2, trashedAt: 3 } };
  expect(parseScenarioExportEntry(trashed)).toEqual(trashed);
  expect(parseScenarioExportEntry({ ...legacy, trashState: { updatedAt: 4 } })).toMatchObject({
    trashState: { updatedAt: 4 },
  });
  for (const trashState of [
    null,
    {},
    { updatedAt: -1 },
    { updatedAt: Number.NaN },
    { updatedAt: 1, trashedAt: 'bad' },
    { updatedAt: 1, trashedAt: Number.POSITIVE_INFINITY },
  ]) {
    expect(parseScenarioExportEntry({ ...legacy, trashState })).toBeNull();
  }
});
