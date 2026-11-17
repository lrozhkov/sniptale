import { expect, it } from 'vitest';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createTourDocument,
  createTourImageSlide,
} from '../../../../features/scenario/project/public';
import { parseScenarioProjectEntry } from '../../../../composition/persistence/scenario/read-guards';
import {
  encodePortableScenarioUnitHistory,
  decodePortableScenarioUnitHistory,
} from './scenario-history';
import {
  decodePortableScenarioHistory,
  decodePortableScenarioHistoryBody,
  encodePortableScenarioProjectEntry,
} from './projects';

function fixture() {
  const project = createGuideProject('Current', 'guide', 10);
  const step = createGuideStep('Shared', 'step');
  step.blocks = [
    createGuideImageBlock({
      id: 'image',
      assetId: 'child',
      width: 100,
      height: 50,
      editDocumentId: 'document',
      source: { kind: 'import', filename: 'one.png' },
    }),
  ];
  project.items = [step];
  const slide = createTourImageSlide('slide');
  slide.image = {
    assetId: 'child',
    galleryAssetId: null,
    editDocumentId: 'document',
    width: 100,
    height: 50,
    alt: '',
    source: { kind: 'import', filename: 'one.png' },
  };
  project.tour = {
    ...createTourDocument('tour'),
    slides: [slide],
    audioResources: [{ assetId: 'audio', duration: 1, name: 'Voice' }],
  };
  return {
    id: project.id,
    project,
    createdAt: 1,
    updatedAt: 10,
    workspaceRevision: 10,
    history: [{ revision: 1, savedAt: 1, project: { ...project, updatedAt: 1, name: 'Saved' } }],
    editingHistory: {
      version: 1 as const,
      past: [{ ...project, name: 'Past' }],
      future: [{ ...project, name: 'Future' }],
    },
  };
}

it('round-trips the complete native shared-unit graph through logical portable references', () => {
  const entry = fixture();
  const before = structuredClone(entry);
  const body = encodePortableScenarioUnitHistory(entry);
  expect(body.units).toHaveLength(2);
  expect(JSON.stringify(body)).not.toContain('"assetId"');
  expect(JSON.stringify(body)).toContain('"scenarioAssetId":"child"');
  expect(decodePortableScenarioUnitHistory(body, entry.id)).toEqual(
    parseScenarioProjectEntry(entry)
  );
  const portable = encodePortableScenarioProjectEntry(entry);
  const decoded = decodePortableScenarioHistoryBody(body, entry.id, portable.project);
  expect(decoded.history.map((version) => version.project)).toHaveLength(1);
  expect(decoded.editingHistory?.past).toHaveLength(1);
  expect(decoded.editingHistory?.future).toHaveLength(1);
  expect(entry).toEqual(before);
  // Readers that only admit the old array cannot silently discard the editing branches.
  expect(() => decodePortableScenarioHistory(body, entry.id)).toThrow();
});

it('preserves an explicit empty checkpoint and rejects a different current project binding', () => {
  const entry = { ...fixture(), editingHistory: { version: 1 as const, past: [], future: [] } };
  const body = encodePortableScenarioUnitHistory(entry);
  const current = encodePortableScenarioProjectEntry(entry).project;
  expect(decodePortableScenarioHistoryBody(body, entry.id, current).editingHistory).toEqual({
    version: 1,
    past: [],
    future: [],
  });
  const other = encodePortableScenarioProjectEntry({
    ...entry,
    project: { ...entry.project, name: 'Other' },
  });
  expect(() => decodePortableScenarioHistoryBody(body, entry.id, other.project)).toThrow(
    'differs from metadata'
  );
});

it('refuses unsupported, incomplete, duplicated, foreign, unused or local-reference graph bodies', () => {
  const entry = fixture();
  const body = encodePortableScenarioUnitHistory(entry);
  const foreign = body.units.map((unit) =>
    isPlainRecord(unit) ? { ...unit, projectId: 'foreign' } : unit
  );
  const local = body.units.map((unit) =>
    isPlainRecord(unit) && isPlainRecord(unit['value'])
      ? { ...unit, value: { ...unit['value'], assetId: 'local' } }
      : unit
  );
  const orphan = {
    projectId: entry.id,
    unitId: 'guide:unused',
    revision: 1,
    value: { id: 'unused' },
  };
  for (const value of [
    { ...body, version: 2 },
    { ...body, units: [] },
    { ...body, units: [...body.units, ...body.units] },
    { ...body, units: foreign },
    { ...body, units: local },
    { ...body, units: [...body.units, orphan] },
    { ...body, extra: true },
  ])
    expect(() => decodePortableScenarioUnitHistory(value, entry.id)).toThrow();
  expect(() => decodePortableScenarioUnitHistory(body, 'foreign')).toThrow();
});
