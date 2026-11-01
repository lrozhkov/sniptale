import { expect, it } from 'vitest';
import { collectTargetAssetSnapshot } from './retention-index';
import { createTargetAssetDatabaseFixture } from './retention-authority.test-support';

const source = { id: 'private', assetId: 'target', createdAt: 1, mimeType: 'image/png', size: 3 };
const ref = {
  assetId: 'target',
  createdAt: 1,
  mimeType: 'image/png',
  size: 3,
  sha256: null,
  location: { kind: 'opfs', objectKey: 'objects/target' },
};
const owner = { ownerKind: 'project-asset', ownerId: 'private', role: 'body', assetId: 'target' };

it('reads only target claims while preserving projected owners and immutable bindings', async () => {
  const unrelated = Array.from({ length: 1000 }, (_, index) => ({
    ...source,
    id: `unrelated-${index}`,
    assetId: `other-${index}`,
  }));
  const db = createTargetAssetDatabaseFixture(async (name) =>
    name === 'project_assets'
      ? [source, ...unrelated]
      : name === 'asset_refs'
        ? [ref]
        : name === 'asset_owners'
          ? [owner]
          : []
  );
  const snapshot = await collectTargetAssetSnapshot(db, ['target']);
  expect(snapshot).toMatchObject({
    authorityValid: true,
    refs: [ref],
    owners: [owner],
    expectedOwners: [owner],
  });
  expect(snapshot.expectedOwnerAssets.get('project-asset\u0000private\u0000body')).toBe('target');
  expect(db.requests.mock.calls.every(([, , key]) => key !== undefined)).toBe(true);
});

it('retains bytes when an unrelated source has unknown physical reference evidence', async () => {
  const db = createTargetAssetDatabaseFixture(async (name) =>
    name === 'project_assets' ? [{ id: 'corrupt', assetId: null }] : []
  );
  expect((await collectTargetAssetSnapshot(db, ['target'])).authorityValid).toBe(false);
});

it('keeps conflicting projected owner bindings visible for private-source refusal', async () => {
  const replacement = { ...owner, assetId: 'replacement' };
  const db = createTargetAssetDatabaseFixture(async (name) =>
    name === 'project_assets'
      ? [source]
      : name === 'asset_owners'
        ? [replacement]
        : name === 'asset_refs'
          ? [ref]
          : []
  );
  const snapshot = await collectTargetAssetSnapshot(db, ['target']);
  expect(snapshot.expectedOwners).toEqual([owner]);
  expect(snapshot.owners).toEqual([replacement]);
  expect(snapshot.refs).toEqual([ref]);
});
