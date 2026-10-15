import { expect, it, vi } from 'vitest';
import { createMediaLibraryEntry } from './index.test-support';
import {
  admitKnownLibraryPublication,
  readKnownLibrarySource,
  type ReadKnownLibrarySource,
} from './known-library-source';
import { parseProjectAssetPayload } from './asset-publication-payload';
import { UnresolvedAssetPublicationError } from '../assets/publication';

const ref = {
  assetId: 'body',
  mimeType: 'video/webm',
  size: 5,
  createdAt: 1,
  sha256: null,
  location: { kind: 'opfs' as const, objectKey: 'objects/body' },
};
const locator = { kind: 'project-export' as const, exportId: 'export', projectId: 'project' };
const media = createMediaLibraryEntry({
  id: 'export:one',
  kind: 'export',
  source: locator,
  mimeType: ref.mimeType,
  size: ref.size,
});
const exported = {
  id: 'export',
  projectId: 'project',
  assetId: ref.assetId,
  createdAt: 1,
  filename: 'one.webm',
  size: ref.size,
  width: 640,
  height: 360,
  duration: 2,
  fps: 30,
};
const entry = {
  id: 'private',
  assetId: ref.assetId,
  createdAt: 2,
  mimeType: ref.mimeType,
  size: ref.size,
  originMediaId: media.id,
};
const claim = { mediaId: media.id, source: locator };
const owner = { assetId: ref.assetId, ownerId: entry.id, ownerKind: 'project-asset', role: 'body' };
const payload = {
  entry,
  filename: 'one.webm',
  expectedAssetId: null,
  publishToLibrary: false,
  expectedLibrarySource: claim,
};
function fixture() {
  const values = new Map<string, unknown>([
    [`media_library:${media.id}`, media],
    ['project_exports:export', exported],
    ['asset_refs:body', ref],
  ]);
  const read: ReadKnownLibrarySource = vi.fn(async (store, key) =>
    values.get(`${store}:${Array.isArray(key) ? key.join('/') : key}`)
  );
  return { read, values };
}

it('admits the full immutable export identity including legacy MIME fallback', async () => {
  const { read } = fixture();
  expect(await readKnownLibrarySource(media.id, read)).toMatchObject({ source: locator, ref });
  expect(await admitKnownLibraryPublication({ claim, entry, ref, read })).toBe('fresh');
  expect(parseProjectAssetPayload(payload)).toEqual(payload);
});

it.each(['trash', 'deleted'] as const)(
  'accepts exact lost-ACK replay after origin %s without reading it',
  async (mode) => {
    const { read, values } = fixture();
    values.set('project_assets:private', entry);
    values.set('asset_owners:project-asset/private/body', owner);
    if (mode === 'deleted') values.delete(`media_library:${media.id}`);
    else
      values.set(`media_library:${media.id}`, {
        ...media,
        lifecycle: { ...media.lifecycle, trashedAt: 3 },
      });
    expect(await admitKnownLibraryPublication({ claim, entry, ref, read })).toBe('replay');
    expect(read).not.toHaveBeenCalledWith('media_library', media.id);
  }
);

it.each([
  'missing-owner',
  'wrong-owner',
  'wrong-ref',
  'metadata',
  'orphan-owner',
  'malformed',
  'different-body',
])('refuses an ambiguous or replaced destination: %s', async (mode) => {
  const { read, values } = fixture();
  values.set('project_assets:private', entry);
  values.set('asset_owners:project-asset/private/body', owner);
  if (mode === 'missing-owner') values.delete('asset_owners:project-asset/private/body');
  if (mode === 'wrong-owner')
    values.set('asset_owners:project-asset/private/body', { ...owner, assetId: 'wrong' });
  if (mode === 'wrong-ref') values.set('asset_refs:body', { ...ref, sha256: 'a'.repeat(64) });
  if (mode === 'metadata') values.set('project_assets:private', { ...entry, createdAt: 3 });
  if (mode === 'orphan-owner') values.delete('project_assets:private');
  if (mode === 'malformed') values.set('project_assets:private', {});
  if (mode === 'different-body')
    values.set('project_assets:private', { ...entry, assetId: 'other' });
  await expect(admitKnownLibraryPublication({ claim, entry, ref, read })).rejects.toBeInstanceOf(
    UnresolvedAssetPublicationError
  );
});

it.each([
  'missing',
  'invalid',
  'trash',
  'unsupported',
  'locator',
  'missing-source',
  'source-id',
  'source-size',
  'source-mime',
  'missing-ref',
  'ref-size',
])('refuses changed fresh source evidence: %s', async (mode) => {
  const { read, values } = fixture();
  if (mode === 'missing') values.delete(`media_library:${media.id}`);
  if (mode === 'invalid') values.set(`media_library:${media.id}`, {});
  if (mode === 'trash')
    values.set(`media_library:${media.id}`, {
      ...media,
      lifecycle: { ...media.lifecycle, trashedAt: 3 },
    });
  if (mode === 'unsupported')
    values.set(`media_library:${media.id}`, {
      ...media,
      source: { kind: 'stored-asset', assetId: 'body' },
    });
  if (mode === 'locator') values.set('project_exports:export', { ...exported, projectId: 'other' });
  if (mode === 'missing-source') values.delete('project_exports:export');
  if (mode === 'source-id') values.set('project_exports:export', { ...exported, id: 'other' });
  if (mode === 'source-size') values.set('project_exports:export', { ...exported, size: 6 });
  if (mode === 'source-mime')
    values.set('project_exports:export', { ...exported, mimeType: 'audio/wav' });
  if (mode === 'missing-ref') values.delete('asset_refs:body');
  if (mode === 'ref-size') values.set('asset_refs:body', { ...ref, size: 6 });
  await expect(admitKnownLibraryPublication({ claim, entry, ref, read })).rejects.toThrow();
});

it.each([
  { expectedAssetId: 'body' },
  { publishToLibrary: true },
  { librarySourceId: 'export:one' },
  { entry: { ...entry, originMediaId: 'other' } },
  { expectedLibrarySource: { ...claim, extra: true } },
  { expectedLibrarySource: { ...claim, source: { ...locator, extra: true } } },
  { expectedLibrarySource: { mediaId: '', source: locator } },
  { expectedLibrarySource: { ...claim, source: { kind: 'recording', recordingId: '' } } },
  { expectedLibrarySource: { ...claim, source: { kind: 'stored-asset', assetId: 'body' } } },
  { requiredReview: { aggregateId: 'review', clipId: 'clip' } },
])('rejects incompatible or non-exact known source claim %#', (patch) => {
  expect(parseProjectAssetPayload({ ...payload, ...patch })).toBeNull();
});

it('admits a strict recording locator and rejects a mismatching prepared body', async () => {
  expect(
    parseProjectAssetPayload({
      ...payload,
      expectedLibrarySource: { ...claim, source: { kind: 'recording', recordingId: 'mic' } },
    })
  ).not.toBeNull();
  const { read } = fixture();
  await expect(
    admitKnownLibraryPublication({ claim, entry: { ...entry, size: 6 }, ref, read })
  ).rejects.toThrow();
});

it.each(['valid', 'missing', 'wrong-id', 'wrong-size', 'wrong-mime'])(
  'admits only exact known recording source evidence: %s',
  async (mode) => {
    const { values, read } = fixture();
    values.set(`media_library:${media.id}`, {
      ...media,
      source: { kind: 'recording', recordingId: 'mic' },
      kind: 'recording',
    });
    const recording = {
      id: 'mic',
      assetId: ref.assetId,
      filename: 'mic.webm',
      mimeType: ref.mimeType,
      size: ref.size,
      createdAt: 1,
    };
    if (mode !== 'missing')
      values.set('recordings:mic', {
        ...recording,
        ...(mode === 'wrong-id' ? { id: 'other' } : {}),
        ...(mode === 'wrong-size' ? { size: 6 } : {}),
        ...(mode === 'wrong-mime' ? { mimeType: 'audio/wav' } : {}),
      });
    if (mode === 'valid')
      await expect(readKnownLibrarySource(media.id, read)).resolves.toMatchObject({ ref });
    else await expect(readKnownLibrarySource(media.id, read)).rejects.toThrow();
  }
);
