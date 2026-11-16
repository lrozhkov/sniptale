import { expect, it } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createTourDocument,
} from '../../../features/scenario/project/factories';
import { createScenarioProjectEntry } from './projects/entry';
import { collectScenarioResourceReferences } from './resource-references';

function project(label: string, assetId = label) {
  const value = createGuideProject(label, 'guide', 1);
  const step = createGuideStep(label, `step-${label}`);
  step.blocks.push(
    createGuideImageBlock({
      id: `image-${label}`,
      assetId,
      editDocumentId: `document-${label}`,
      width: 10,
      height: 10,
      source: { kind: 'import', filename: 'source.png' },
    })
  );
  value.items.push(step);
  value.tour = createTourDocument(`tour-${label}`);
  value.tour.audioResources = [{ assetId: `audio-${label}`, duration: 1, name: 'Audio' }];
  return value;
}

it('retains Guide documents and Tour audio from current, archive and both editing branches', () => {
  const entry = {
    ...createScenarioProjectEntry({
      existing: undefined,
      project: project('current'),
      updatedAt: 5,
    }),
    history: [{ revision: 0, savedAt: 1, project: project('archive') }],
    editingHistory: { version: 1 as const, past: [project('past')], future: [project('future')] },
  };
  const before = structuredClone(entry);
  const actual = collectScenarioResourceReferences(entry);
  expect([...actual.assets].sort()).toEqual([
    'archive',
    'audio-archive',
    'audio-current',
    'audio-future',
    'audio-past',
    'current',
    'future',
    'past',
  ]);
  expect([...actual.documents].sort()).toEqual([
    'document-archive',
    'document-current',
    'document-future',
    'document-past',
  ]);
  expect(entry).toEqual(before);
});

it('deduplicates logical child aliases without losing separate editable document identities', () => {
  const current = project('current', 'shared');
  const past = project('past', 'shared');
  const entry = {
    ...createScenarioProjectEntry({ existing: undefined, project: current, updatedAt: 5 }),
    editingHistory: { version: 1 as const, past: [past], future: [current, past] },
  };
  const actual = collectScenarioResourceReferences(entry);
  expect([...actual.assets].sort()).toEqual(['audio-current', 'audio-past', 'shared']);
  expect([...actual.documents].sort()).toEqual(['document-current', 'document-past']);
  const empty = createGuideProject('Empty', 'empty', 1);
  expect(
    collectScenarioResourceReferences(
      createScenarioProjectEntry({ existing: undefined, project: empty })
    )
  ).toEqual({ assets: new Set(), documents: new Set() });
});
