import { expect, it } from 'vitest';
import {
  collectReadyJournalMediaKeys,
  mediaHasPendingPublication,
  readyMediaTargetKeys,
} from './ready-media-claims';

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

it.each([
  ['project-assets', { entry: { id: '' } }, 'unknown:project-asset'],
  ['project-exports', { entry: { id: 'export', projectId: '' } }, 'unknown:project-export-owner'],
  ['recording-assets', { entries: [{ id: '' }] }, 'unknown:recording'],
  ['web-snapshot-assets', { snapshot: { id: '' } }, 'unknown:web-snapshot'],
])('retains %s when its family identity is empty', (domain, payload, unknownKey) => {
  expect(collectReadyJournalMediaKeys({ domain, payload })).toContain(unknownKey);
});
