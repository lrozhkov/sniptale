import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { hydratePersistedEditorDocument } from '../document-assets/codec';
import { parsePersistedEditorDocument } from '../document-assets/parser';
import { releaseExpiredPrivateSources } from './private-source-retention';
import { buildPhysicalDeleteOperation } from './operations';
import type { AssetOwner, AssetRef, AssetReadyJournal } from './contracts';
import type { collectDurableAssetSnapshot } from './retention-authority';

const harness = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
}));

vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  readAssetFile: vi.fn(async () => new File(['svg'], 'image.svg', { type: 'image/svg+xml' })),
}));
vi.mock('../../../platform/media-utils/data-url', async (original) => ({
  ...(await original<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: vi.fn(async () => 'data:image/svg+xml;base64,c3Zn'),
}));

let rows: Map<string, Map<string, unknown>>;
let failure = false;
const ref: AssetRef = {
  assetId: 'bytes',
  createdAt: 1,
  mimeType: 'image/svg+xml',
  size: 3,
  sha256: null,
  location: { kind: 'opfs', objectKey: 'objects/bytes' },
};
const owner: AssetOwner = {
  assetId: 'bytes',
  ownerKind: 'project-asset',
  ownerId: 'private',
  role: 'body',
};
const source = {
  id: 'private',
  assetId: 'bytes',
  createdAt: 1,
  mimeType: 'image/svg+xml',
  size: 3,
};
const intent = () => ({
  ...buildPhysicalDeleteOperation([]),
  privateSources: [{ projectAssetId: 'private', expectedAssetId: 'bytes' }],
});
const snapshot = (): Awaited<ReturnType<typeof collectDurableAssetSnapshot>> => ({
  authorityValid: true,
  archiveSessions: [],
  embeddedBinaryMetadata: [],
  expectedOwnerAssets: new Map(),
  expectedOwners: [owner],
  owners: [owner],
  operationIds: new Set(),
  protectedRollbackAssetIds: new Set(),
  publishedProjectAssetIds: new Set(),
  refs: [ref],
});
beforeEach(() => {
  failure = false;
  const fixture = createReviewWorkspaceStoreFixture(
    (store) => failure && store === 'asset_operations'
  );
  rows = fixture.rows;
  rows.set('project_export_inputs', new Map());
  rows.get('project_assets')!.set('private', source);
  rows.get('asset_refs')!.set('bytes', ref);
  rows.get('asset_owners')!.set(JSON.stringify(['project-asset', 'private', 'body']), owner);
  harness.database.mockResolvedValue(fixture.database);
});
async function retire(authority = snapshot(), journals: AssetReadyJournal[] = []) {
  const operation = intent();
  rows.get('asset_operations')!.set(operation.operationId, operation);
  return releaseExpiredPrivateSources(operation, authority, journals);
}

it('atomically releases only the causal source and journals physical bytes before deletion', async () => {
  const next = await retire();
  expect(rows.get('project_assets')!.has('private')).toBe(false);
  expect(rows.get('asset_owners')!.size).toBe(0);
  expect(rows.get('asset_refs')!.has('bytes')).toBe(false);
  expect(next).toMatchObject({ assetIds: ['bytes'], privateSources: [] });
  expect(rows.get('asset_operations')!.get(next.operationId)).toEqual(next);
});

it.each([
  'library',
  'image-sidecar',
  'review-sidecar',
  'scenario',
  'montage',
  'pending-input',
  'invalid-review',
] as const)('preserves private binding protected by %s', async (kind) => {
  const project = {
    project: {
      version: 2,
      source: { kind: 'manual' },
      baseRecordingId: null,
      assets: [{ source: { kind: 'project-asset', projectAssetId: 'private' } }],
    },
  };
  if (kind === 'library') rows.get('media_library')!.set('project-asset:private', {});
  if (kind === 'image-sidecar') rows.get('image_workspaces')!.set('project-asset:private', {});
  if (kind === 'review-sidecar') rows.get('video_workspaces')!.set('project-asset:private', {});
  if (kind === 'invalid-review')
    rows.get('video_workspaces')!.set('foreign', { aggregateId: 'foreign', formatVersion: 99 });
  if (kind === 'scenario')
    rows
      .get('scenario_assets')!
      .set('child', { id: 'child', assetId: 'other', galleryAssetId: 'project-asset:private' });
  if (kind === 'montage') rows.get('video_projects')!.set('other', project);
  if (kind === 'pending-input') rows.get('project_export_inputs')!.set('job', project);
  expect(await retire()).toMatchObject({
    assetIds: [],
    privateSources: [{ projectAssetId: 'private', expectedAssetId: 'bytes' }],
  });
  expect(rows.get('project_assets')!.get('private')).toEqual(source);
  expect(rows.get('asset_refs')!.has('bytes')).toBe(true);
});

it.each([
  'invalid-authority',
  'rollback',
  'publication',
  'published-identity',
  'owner-mismatch',
] as const)('defers %s without dropping the source or intent', async (kind) => {
  const authority = snapshot();
  const journals: AssetReadyJournal[] = [];
  if (kind === 'invalid-authority') authority.authorityValid = false;
  if (kind === 'rollback') authority.protectedRollbackAssetIds.add('bytes');
  if (kind === 'published-identity') authority.publishedProjectAssetIds.add('private');
  if (kind === 'owner-mismatch') authority.owners = [{ ...owner, assetId: 'different' }];
  if (kind === 'publication')
    journals.push({
      journalId: 'prepared',
      domain: 'image-workspace',
      assetRefs: [],
      createdAt: 1,
      payload: { refs: [ref] },
    });
  expect(await retire(authority, journals)).toMatchObject({
    assetIds: [],
    privateSources: [{ projectAssetId: 'private', expectedAssetId: 'bytes' }],
  });
  expect(rows.get('project_assets')!.get('private')).toEqual(source);
});

it('keeps shared bytes and the other exact owner after releasing a private representation', async () => {
  const other = { ...owner, ownerKind: 'image-workspace', ownerId: 'copy', role: 'image' };
  rows
    .get('asset_owners')!
    .set(JSON.stringify([other.ownerKind, other.ownerId, other.role]), other);
  const authority = snapshot();
  authority.owners.push(other);
  expect(await retire(authority)).toMatchObject({ assetIds: [], privateSources: [] });
  expect(rows.get('project_assets')!.has('private')).toBe(false);
  expect([...rows.get('asset_owners')!.values()]).toEqual([other]);
  expect(rows.get('asset_refs')!.get('bytes')).toEqual(ref);
});

it('does not delete a replacement binding or schedule its unrelated bytes', async () => {
  rows.get('project_assets')!.set('private', { ...source, assetId: 'replacement' });
  expect(await retire()).toMatchObject({ assetIds: [], privateSources: [] });
  expect(rows.get('project_assets')!.get('private')).toMatchObject({ assetId: 'replacement' });
  expect(rows.get('asset_refs')!.get('bytes')).toEqual(ref);
});

it('rolls logical release back when the durable intent update fails', async () => {
  const operation = intent();
  rows.get('asset_operations')!.set(operation.operationId, operation);
  const before = structuredClone([...rows].map(([store, entries]) => [store, [...entries]]));
  failure = true;
  await expect(releaseExpiredPrivateSources(operation, snapshot(), [])).rejects.toThrow('No space');
  expect([...rows].map(([store, entries]) => [store, [...entries]])).toEqual(before);
});

it.each(['missing', 'mismatched'] as const)(
  'preserves readable document bytes when another projected owner is %s',
  async (kind) => {
    const other = { ...owner, ownerKind: 'image-workspace', ownerId: 'copy', role: 'source-image' };
    const authority = snapshot();
    authority.expectedOwners.push(other);
    if (kind === 'mismatched') {
      const actual = { ...other, assetId: 'replacement' };
      authority.owners.push(actual);
      rows
        .get('asset_owners')!
        .set(JSON.stringify([actual.ownerKind, actual.ownerId, actual.role]), actual);
    }
    const { backgroundImageData: _background, ...frame } = DEFAULT_EDITOR_FRAME_SETTINGS;
    const document = parsePersistedEditorDocument({
      version: 3,
      sourceImage: { assetId: 'bytes' },
      sourceName: 'image.svg',
      sourceWidth: 100,
      sourceHeight: 80,
      canvasWidth: 100,
      canvasHeight: 80,
      sourceLeft: 0,
      sourceTop: 0,
      sourceDisplayWidth: 100,
      sourceDisplayHeight: 80,
      frame: { ...frame, backgroundImage: null },
      canvasJson: '{"objects":[]}',
      assets: [{ assetId: 'bytes', role: 'source-image' }],
    });
    if (!document) throw new Error('Invalid regression document.');
    expect(await retire(authority)).toMatchObject({
      assetIds: [],
      privateSources: [{ projectAssetId: 'private', expectedAssetId: 'bytes' }],
    });
    expect(rows.get('project_assets')!.get('private')).toEqual(source);
    const hydrated = await hydratePersistedEditorDocument({
      document,
      refs: [...rows.get('asset_refs')!.values()],
    });
    expect(hydrated.document.sourceImageData).toBe('data:image/svg+xml;base64,c3Zn');
    hydrated.release();
  }
);
