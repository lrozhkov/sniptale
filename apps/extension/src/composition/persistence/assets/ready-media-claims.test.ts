import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VIDEO_PROJECT_WORKSPACE_PUBLICATION_DOMAIN } from '../projects/history-contracts';
import {
  collectReadyJournalMediaKeys,
  mediaHasPendingPublication,
  readyMediaTargetKeys,
  UNKNOWN_READY_MEDIA,
} from './ready-media-claims';

it('retains the destination, current and historical sources of a prepared Montage workspace', () => {
  const project = createEmptyVideoProject('Current');
  project.baseRecordingId = 'current-recording';
  const journal = {
    domain: VIDEO_PROJECT_WORKSPACE_PUBLICATION_DOMAIN,
    payload: {
      project,
      history: {
        version: 1,
        epoch: 'epoch',
        past: [],
        future: [],
        sources: [
          { kind: 'recording', id: 'removed-recording' },
          { kind: 'project-asset', id: 'removed-private' },
          { kind: 'library-asset', id: 'removed-library' },
        ],
      },
    },
  };
  const keys = collectReadyJournalMediaKeys(journal);
  expect(keys).toEqual(
    expect.arrayContaining([
      `project-export-owner:${project.id}`,
      'recording:current-recording',
      'recording:removed-recording',
      'project-asset:removed-private',
      'media:project-asset:removed-private',
      'media:removed-library',
    ])
  );
  expect(
    readyMediaTargetKeys({ id: project.id, projectAssetIds: [] }).some((key) => keys.includes(key))
  ).toBe(true);
  expect(mediaHasPendingPublication(journal, { id: 'removed-library' })).toBe(true);
  expect(mediaHasPendingPublication(journal, { id: 'unrelated' })).toBe(false);
});

it.each([null, {}, { project: createEmptyVideoProject('Current'), history: { version: 99 } }])(
  'retains malformed Montage workspace publication conservatively: %j',
  (payload) => {
    expect(
      collectReadyJournalMediaKeys({ domain: VIDEO_PROJECT_WORKSPACE_PUBLICATION_DOMAIN, payload })
    ).toEqual(expect.arrayContaining(['unknown:media', 'unknown:project-export-owner']));
  }
);

it('selects exports by parent owner and private assets without selecting other parents', () => {
  const keys = readyMediaTargetKeys({ id: 'parent', projectAssetIds: ['private'] });
  expect(keys).toEqual(
    expect.arrayContaining([
      'project-export-owner:parent',
      'project-asset:private',
      'media:project-asset:private',
      'unknown:project-export-owner',
      'unknown:project-asset',
      'unknown:media',
    ])
  );
  const related = collectReadyJournalMediaKeys({
    domain: 'project-exports',
    payload: { entry: { id: 'export', projectId: 'parent' } },
  });
  const unrelated = collectReadyJournalMediaKeys({
    domain: 'project-exports',
    payload: { entry: { id: 'other-export', projectId: 'other-parent' } },
  });
  expect(related.some((key) => keys.includes(key))).toBe(true);
  expect(unrelated.some((key) => keys.includes(key))).toBe(false);
});

it('matches pending sync images before a Library source row exists', () => {
  const journal = {
    domain: 'sync-replica',
    payload: { kind: 'image', input: { media: { id: 'missing-row' } } },
  };
  expect(mediaHasPendingPublication(journal, { id: 'missing-row' })).toBe(true);
  expect(mediaHasPendingPublication(journal, { id: 'unrelated' })).toBe(false);
});

it.each([
  [
    'recording-assets',
    { entries: [{ id: 'recording' }] },
    { id: 'media', source: { kind: 'recording' as const, recordingId: 'recording' } },
  ],
  [
    'project-assets',
    { entry: { id: 'private', originMediaId: 'origin' } },
    { id: 'media', source: { kind: 'project-asset' as const, projectAssetId: 'private' } },
  ],
  [
    'project-exports',
    { entry: { id: 'export', projectId: 'parent' } },
    { id: 'media', source: { kind: 'project-export' as const, exportId: 'export' } },
  ],
  [
    'web-snapshot-assets',
    { snapshot: { id: 'snapshot' }, mediaEntry: { id: 'origin' } },
    { id: 'media', source: { kind: 'web-snapshot' as const, snapshotId: 'snapshot' } },
  ],
])('matches %s by its source alias', (domain, payload, target) => {
  expect(mediaHasPendingPublication({ domain, payload }, target)).toBe(true);
  expect(mediaHasPendingPublication({ domain, payload }, { id: 'unrelated' })).toBe(false);
});

it.each([
  ['project-assets', { entry: {} }, 'unknown:project-asset'],
  ['project-exports', { entry: { id: 'export' } }, 'unknown:project-export-owner'],
  ['recording-assets', { entries: [null] }, 'unknown:recording'],
  ['web-snapshot-assets', { snapshot: {} }, 'unknown:web-snapshot'],
  ['sync-replica', { kind: 'future', input: {} }, 'unknown:media'],
  ['sync-replica', { kind: 'image', input: { media: {} } }, 'unknown:media'],
  ['sync-replica', { kind: 'video-review', input: { root: {} } }, 'unknown:media'],
])('retains malformed %s source envelopes conservatively', (domain, payload, unknownKey) => {
  expect(collectReadyJournalMediaKeys({ domain, payload })).toContain(unknownKey);
});

it.each([
  ['project-assets', 'unknown:project-asset'],
  ['project-exports', 'unknown:project-export-owner'],
  ['recording-assets', 'unknown:recording'],
  ['web-snapshot-assets', 'unknown:web-snapshot'],
])('retains %s when its entire payload is malformed', (domain, unknownKey) => {
  expect(collectReadyJournalMediaKeys({ domain, payload: null })).toContain(unknownKey);
});

it.each([null, {}, { aggregateId: '' }])(
  'retains image workspace publication when its aggregate identity is unknown: %j',
  (payload) => {
    expect(
      mediaHasPendingPublication({ domain: 'image-workspace', payload }, { id: 'target' })
    ).toBe(true);
  }
);

it.each(['original', 'newOriginal'] as const)(
  'retains the project ID and its %s source during image publication',
  (field) => {
    const journal = {
      domain: 'image-workspace',
      payload: { aggregateId: 'project', [field]: { mediaId: 'origin' } },
    };
    expect(collectReadyJournalMediaKeys(journal)).toEqual(['media:project', 'media:origin']);
    expect(mediaHasPendingPublication(journal, { id: 'origin' })).toBe(true);
    expect(mediaHasPendingPublication(journal, { id: 'unrelated' })).toBe(false);
  }
);

it.each(['original', 'newOriginal'] as const)(
  'retains originals when an image journal has an unknown %s identity',
  (field) => {
    const journal = {
      domain: 'image-workspace',
      payload: { aggregateId: 'project', [field]: {} },
    };
    expect(collectReadyJournalMediaKeys(journal)).toContain(UNKNOWN_READY_MEDIA);
  }
);

it.each([
  ['project-assets', { entry: { id: '' } }, 'unknown:project-asset'],
  ['project-exports', { entry: { id: 'export', projectId: '' } }, 'unknown:project-export-owner'],
  ['recording-assets', { entries: [{ id: '' }] }, 'unknown:recording'],
  ['web-snapshot-assets', { snapshot: { id: '' } }, 'unknown:web-snapshot'],
])('retains %s when its family identity is empty', (domain, payload, unknownKey) => {
  expect(collectReadyJournalMediaKeys({ domain, payload })).toContain(unknownKey);
});
