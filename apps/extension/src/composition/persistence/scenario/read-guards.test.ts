import { expect, it } from 'vitest';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/public';
import {
  parseScenarioProjectEntry,
  parseScenarioProjectSummary,
  parseScenarioExportEntry,
} from './read-guards';

it('shares only privately admitted history while the current project and default reads stay detached', () => {
  const item = createGuideStep('', 'step');
  const project = { ...createGuideProject('Owned', 'owned', 1), items: [item], updatedAt: 3 };
  const value = {
    id: project.id,
    project,
    createdAt: 1,
    updatedAt: 3,
    workspaceRevision: 2,
    history: [
      { revision: 0, savedAt: 1, project: { ...project, updatedAt: 1 } },
      { revision: 1, savedAt: 2, project: { ...project, updatedAt: 2 } },
    ],
  };
  const owned = parseScenarioProjectEntry(value, 'exclusive');
  const borrowed = parseScenarioProjectEntry(value);
  expect(owned).toEqual(borrowed);
  expect(owned?.history?.[0]?.project.items[0]).toBe(owned?.history?.[1]?.project.items[0]);
  expect(owned?.project.items[0]).not.toBe(owned?.history?.[0]?.project.items[0]);
  expect(owned?.history?.[0]?.project.items[0]).not.toBe(item);
  expect(borrowed?.history?.[0]?.project.items[0]).not.toBe(
    borrowed?.history?.[1]?.project.items[0]
  );
});

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

it('preserves immutable HTML identity and rejects malformed or foreign-format artifacts', () => {
  const entry = {
    id: 'export',
    projectId: 'project',
    format: 'html',
    filename: 'saved.html',
    createdAt: 1,
    size: 4,
  };
  for (const mode of ['guide', 'tour']) {
    const value = { ...entry, html: { mode, assetId: 'body' } };
    expect(parseScenarioExportEntry(value)).toEqual(value);
  }
  for (const html of [
    null,
    {},
    { mode: 'pdf', assetId: 'body' },
    { mode: 'guide', assetId: '' },
    { mode: 'guide', assetId: 4 },
  ])
    expect(parseScenarioExportEntry({ ...entry, html })).toBeNull();
  expect(
    parseScenarioExportEntry({ ...entry, format: 'pdf', html: { mode: 'guide', assetId: 'body' } })
  ).toBeNull();
  expect(
    parseScenarioExportEntry({ ...entry, size: 0, html: { mode: 'guide', assetId: 'body' } })
  ).toBeNull();
});
