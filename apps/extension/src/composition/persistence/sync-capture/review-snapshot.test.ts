import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEffectV1Document } from '@sniptale/runtime-contracts/effect-v1';
import { expect, it } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  workspace as template,
  annotation,
} from '../review-workspaces/backup-restore.test-support';
import { materializeVideoWorkspaceProject } from '../review-workspaces/project-metadata';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import type { VideoWorkspace } from '../review-workspaces/contracts';
import { replaceWorkspaceStorage } from '../review-workspaces/storage';
import { createMediaLibraryEntry, createProjectAssetEntry } from '../projects/index.test-support';
import type { StoredProjectAssetEntry } from '../projects/contracts';
import type { AssetRef } from '../assets/contracts';
import { updateQuickEditBackground } from '../../../features/video/review/advanced/background';
import {
  createReviewAdvancedContentOperation,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import {
  digestCapturedVideoReviewRows,
  freezeVideoReviewInTransaction,
  parseCapturedVideoReviewRows,
} from './review-snapshot';

function fixture() {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const stores = [...fixture.rows.keys()];
  const tx = () =>
    fixture.database.transaction(stores, 'readonly') as unknown as Parameters<
      typeof freezeVideoReviewInTransaction
    >[0];
  const seed = (store: string, id: string, value: unknown) =>
    fixture.rows.get(store)!.set(id, value);
  const asset = (id: string, mimeType = 'image/png', size = 6) => {
    const entry = createProjectAssetEntry({ id, assetId: `bytes-${id}`, mimeType, size });
    const ref: AssetRef = {
      assetId: entry.assetId,
      size,
      mimeType,
      createdAt: 1,
      sha256: null,
      location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
    };
    seed('project_assets', id, entry);
    seed('asset_refs', ref.assetId, ref);
    seed('asset_owners', JSON.stringify(['project-asset', id, 'body']), {
      ownerKind: 'project-asset',
      ownerId: id,
      role: 'body',
      assetId: entry.assetId,
    });
    return entry;
  };
  const original = asset('original', 'video/webm');
  const mediaId = `project-asset:${original.id}`;
  seed(
    'media_library',
    mediaId,
    createMediaLibraryEntry({
      id: mediaId,
      kind: 'video',
      mimeType: original.mimeType,
      size: original.size,
      source: { kind: 'project-asset', projectAssetId: original.id },
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    })
  );
  const workspace = (id = mediaId, source = original): VideoWorkspace =>
    materializeVideoWorkspaceProject(
      {
        ...structuredClone(template),
        aggregateId: id,
        sourceAssetId: source.assetId,
        ...(id === mediaId || id === `project-asset:${source.id}`
          ? {}
          : { sourceMediaId: mediaId }),
        source: { ...template.source, mimeType: source.mimeType, size: source.size },
        history: [],
        cursor: 0,
      },
      id
    );
  const save = (value: VideoWorkspace) => {
    expect(parseVideoWorkspace(value)).not.toBeNull();
    seed('video_workspaces', value.aggregateId, value);
  };
  save(workspace());
  return { ...fixture, seed, asset, tx, workspace, save, mediaId, original };
}

function withImage(workspace: VideoWorkspace, asset: StoredProjectAssetEntry): VideoWorkspace {
  return {
    ...workspace,
    advanced: {
      ...workspace.advanced,
      background: updateQuickEditBackground(workspace.advanced.background, {
        enabled: true,
        type: 'image',
        assetId: `project-asset:${asset.id}`,
      }),
    },
  };
}

it('detaches the complete default and archived review graph', async () => {
  const f = fixture();
  const image = f.asset('image');
  const archive = withImage(f.workspace('project-asset:quick-project:archive'), image);
  f.save(archive);
  f.seed('video_workspace_drafts', archive.aggregateId, {
    aggregateId: archive.aggregateId,
    revision: 1,
    annotation,
    before: null,
    updatedAt: 3,
  });
  const defaultRows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  const archived = await freezeVideoReviewInTransaction(f.tx(), archive.aggregateId);
  expect(archived.review.workspace.sourceMediaId).toBe(f.mediaId);
  expect(f.rows.get('media_library')!.has(archive.aggregateId)).toBe(false);
  expect(defaultRows.assets).toEqual([]);
  expect(archived.assets).toEqual([image]);
  const digest = digestCapturedVideoReviewRows(archived);
  archive.project!.name = 'Changed after capture';
  image.assetId = 'replacement';
  f.rows.get('video_workspace_drafts')!.clear();
  expect(archived.review.workspace.project!.name).not.toBe(archive.project!.name);
  expect(archived.review.draft?.annotation.text).toBe(annotation.text);
  expect(digestCapturedVideoReviewRows(archived)).toBe(digest);
  const parsed = parseCapturedVideoReviewRows(archived)!;
  parsed.review.workspace.project!.name = 'Changed parsed result';
  expect(digestCapturedVideoReviewRows(archived)).toBe(digest);
});

it('rejects a changed source binding and unresolved resources', async () => {
  const f = fixture();
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  expect(
    parseCapturedVideoReviewRows({
      ...rows,
      source: {
        ...rows.source,
        projectAsset: { ...rows.source.projectAsset, assetId: 'foreign-bytes' },
      },
    })
  ).toBeNull();
  const image = f.asset('image');
  f.save(withImage(f.workspace(), image));
  f.rows.get('asset_refs')!.delete(image.assetId);
  await expect(freezeVideoReviewInTransaction(f.tx(), f.mediaId)).rejects.toThrow();
});

it('rejects missing, duplicate and extra supplementary refs', async () => {
  const f = fixture();
  const image = f.asset('image');
  f.save(withImage(f.workspace(), image));
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  expect(parseCapturedVideoReviewRows({ ...rows, refs: [] })).toBeNull();
  expect(parseCapturedVideoReviewRows({ ...rows, refs: [...rows.refs, rows.refs[0]] })).toBeNull();
  expect(
    parseCapturedVideoReviewRows({ ...rows, refs: [...rows.refs, rows.source.ref] })
  ).toBeNull();
  expect(
    parseCapturedVideoReviewRows({ ...rows, assets: [...rows.assets, rows.source.projectAsset] })
  ).toBeNull();
});

it('retains disabled and redo-only resources', async () => {
  const f = fixture();
  const disabled = f.asset('disabled');
  const redo = f.asset('redo');
  const workspace = withImage(f.workspace(), disabled);
  workspace.advanced.background = updateQuickEditBackground(workspace.advanced.background, {
    enabled: false,
  });
  const before = reviewAdvancedContentBaseline(workspace.advanced);
  const after = {
    ...before,
    background: updateQuickEditBackground(before.background, {
      enabled: true,
      type: 'image',
      assetId: `project-asset:${redo.id}`,
    }),
  };
  const operation = createReviewAdvancedContentOperation({
    id: 'redo-background',
    at: 4,
    before,
    after,
  });
  expect(operation).not.toBeNull();
  if (!operation) throw new Error('Invalid test operation');
  workspace.history = [operation];
  f.save(workspace);
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  expect(rows.assets.map((asset) => asset.id).sort()).toEqual(['disabled', 'redo']);
  expect(rows.review.workspace.cursor).toBe(0);
});

it('retains nested private review resources and terminates resource cycles', async () => {
  const f = fixture();
  const first = f.asset('first', 'video/webm');
  const second = f.asset('second', 'video/webm');
  f.save(withImage(f.workspace(), first));
  f.save(withImage(f.workspace(`project-asset:${first.id}`, first), second));
  f.save(withImage(f.workspace(`project-asset:${second.id}`, second), first));
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  expect(rows.assets.map((asset) => asset.id).sort()).toEqual(['first', 'second']);
  expect(rows.privateReviews).toHaveLength(2);
  expect(
    parseCapturedVideoReviewRows({ ...rows, privateReviews: [...rows.privateReviews, rows.review] })
  ).toBeNull();
});

it('keeps a published supplementary review independent', async () => {
  const f = fixture();
  const video = f.asset('published', 'video/webm');
  const image = f.asset('private-image');
  f.save(withImage(f.workspace(), video));
  f.save(withImage(f.workspace(`project-asset:${video.id}`, video), image));
  f.seed(
    'media_library',
    `project-asset:${video.id}`,
    createMediaLibraryEntry({
      id: `project-asset:${video.id}`,
      kind: 'video',
      mimeType: video.mimeType,
      size: video.size,
      source: { kind: 'project-asset', projectAssetId: video.id },
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    })
  );
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  expect(rows.assets.map((asset) => asset.id)).toEqual(['published']);
  expect(rows.media.map((entry) => entry.id)).toEqual(['project-asset:published']);
  expect(rows.privateReviews).toEqual([]);
});

it('refuses recording and foreign resource ownership', async () => {
  const f = fixture();
  const media = f.rows.get('media_library')!.get(f.mediaId);
  f.seed(
    'media_library',
    f.mediaId,
    createMediaLibraryEntry({
      id: f.mediaId,
      source: { kind: 'recording', recordingId: 'unsupported' },
    })
  );
  await expect(freezeVideoReviewInTransaction(f.tx(), f.mediaId)).rejects.toThrow();
  f.seed('media_library', f.mediaId, media);
  f.seed('asset_owners', JSON.stringify(['project-asset', f.original.id, 'body']), {
    ownerKind: 'project-asset',
    ownerId: 'foreign',
    role: 'body',
    assetId: f.original.assetId,
  });
  await expect(freezeVideoReviewInTransaction(f.tx(), f.mediaId)).rejects.toThrow('ownership');
});

it('reads split physical history through the existing transaction', async () => {
  const f = fixture();
  const tx = f.database.transaction([...f.rows.keys()], 'readwrite');
  await replaceWorkspaceStorage(tx, f.workspace(), []);
  await tx.done;
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  expect(rows.review.workspace.aggregateId).toBe(f.mediaId);
  expect(rows.review.workspace.project).toEqual(f.workspace().project);
});

it('retains disabled annotation effect resources from the redo suffix', async () => {
  const f = fixture();
  const source = readFileSync(
    resolve(
      'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json'
    ),
    'utf8'
  );
  const admitted = validateEffectV1Document(JSON.parse(source));
  if (!admitted.ok || !admitted.document) throw new Error('Invalid effect fixture');
  const declared = admitted.document.assets[0]!;
  const resource = f.asset('effect-resource', declared.mimeType, declared.byteLength!);
  const workspace = f.workspace();
  const hash = 'a'.repeat(64);
  const snapshotId = `effect:${hash}`;
  workspace.effectSnapshots = [
    {
      id: snapshotId,
      schemaVersion: 'sniptale.effect.v1',
      kind: 'standalone',
      documentId: admitted.document.id,
      sha256: hash,
      source,
      retainedByteLength: new TextEncoder().encode(source).byteLength + declared.byteLength!,
      assets: [
        {
          id: declared.id,
          kind: 'svg',
          mimeType: declared.mimeType,
          byteLength: declared.byteLength!,
          sha256: declared.sha256!,
          assetId: `project-asset:${resource.id}`,
        },
      ],
    },
  ];
  const before = reviewAdvancedContentBaseline(workspace.advanced);
  workspace.history = [
    {
      id: 'effect-redo',
      at: 1,
      target: 'advancedContent',
      before,
      after: {
        ...before,
        annotationEffects: {
          enabled: false,
          instances: [
            {
              id: 'effect',
              snapshotId,
              enabled: false,
              start: 0,
              end: 1,
              attachment: 'viewport',
              transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
              controls: { accent: '#123456' },
              order: 0,
            },
          ],
        },
      },
    },
  ];
  f.save(workspace);
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  expect(rows.assets.map((asset) => asset.id)).toEqual(['effect-resource']);
  expect(rows.review.workspace.effectSnapshots).toEqual(workspace.effectSnapshots);
  expect(parseCapturedVideoReviewRows({ ...rows, assets: [], refs: [] })).toBeNull();
});

it('retains only the selected workspace thumbnail and rejects a foreign thumbnail', async () => {
  const f = fixture();
  const archive = f.workspace('project-asset:quick-project:thumbnail');
  f.save(archive);
  f.seed('thumbnails', archive.aggregateId, {
    assetId: archive.aggregateId,
    blob: new Blob(['thumbnail'], { type: 'image/png' }),
    width: 100,
    height: 60,
    createdAt: 1,
    updatedAt: 1,
  });
  const rows = await freezeVideoReviewInTransaction(f.tx(), archive.aggregateId);
  expect(rows.thumbnail?.assetId).toBe(archive.aggregateId);
  expect(rows.thumbnail?.blob.size).toBe(9);
  expect((await freezeVideoReviewInTransaction(f.tx(), f.mediaId)).thumbnail).toBeUndefined();
  expect(
    parseCapturedVideoReviewRows({ ...rows, thumbnail: { ...rows.thumbnail, assetId: f.mediaId } })
  ).toBeNull();
});

it('rejects metadata and resource inventories outside the existing capture limits', async () => {
  const f = fixture();
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  expect(
    parseCapturedVideoReviewRows({
      ...rows,
      assets: Array.from({ length: 33 }, () => rows.source.projectAsset),
    })
  ).toBeNull();
  expect(
    parseCapturedVideoReviewRows({
      ...rows,
      review: {
        ...rows.review,
        workspace: {
          ...rows.review.workspace,
          unknown: 'x'.repeat(1024 * 1024),
        },
      },
    })
  ).toBeNull();
});

it('retains independently published origins and refuses a foreign mirror binding', async () => {
  const f = fixture();
  const image = f.asset('acquired');
  image.originMediaId = 'published-origin';
  f.seed(
    'media_library',
    image.originMediaId,
    createMediaLibraryEntry({
      id: image.originMediaId,
      source: { kind: 'stored-asset', assetId: 'origin-bytes' },
      mimeType: image.mimeType,
      size: image.size,
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    })
  );
  f.seed('asset_refs', 'origin-bytes', {
    assetId: 'origin-bytes',
    size: image.size,
    mimeType: image.mimeType,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/origin-bytes' },
  });
  f.seed('asset_owners', JSON.stringify(['media-library', image.originMediaId, 'source']), {
    assetId: 'origin-bytes',
    ownerKind: 'media-library',
    ownerId: image.originMediaId,
    role: 'source',
  });
  f.save(withImage(f.workspace(), image));
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  expect(rows.media.map((entry) => entry.id)).toEqual(['published-origin']);
  expect(rows.refs.map((ref) => ref.assetId).sort()).toEqual(['bytes-acquired', 'origin-bytes']);
  f.seed(
    'media_library',
    `project-asset:${image.id}`,
    createMediaLibraryEntry({
      id: `project-asset:${image.id}`,
      source: { kind: 'project-asset', projectAssetId: f.original.id },
      mimeType: image.mimeType,
      size: image.size,
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    })
  );
  await expect(freezeVideoReviewInTransaction(f.tx(), f.mediaId)).rejects.toThrow();
});

it('rejects a noncanonical primary source identity', async () => {
  const f = fixture();
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  const alias = 'project-asset:unrelated-source';
  expect(
    parseCapturedVideoReviewRows({
      ...rows,
      review: { ...rows.review, workspace: { ...rows.review.workspace, sourceMediaId: alias } },
      source: { ...rows.source, media: { ...rows.source.media, id: alias } },
    })
  ).toBeNull();
});

it('keeps the review fingerprint independent of its original metadata', async () => {
  const f = fixture();
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  const renamed = structuredClone(rows);
  renamed.source.media.filename = 'Renamed original.webm';
  renamed.source.media.tags = ['Source tag'];
  renamed.source.media.updatedAt += 1;
  expect(digestCapturedVideoReviewRows(renamed)).toBe(digestCapturedVideoReviewRows(rows));
  renamed.review.workspace.project!.name = 'Renamed review';
  expect(digestCapturedVideoReviewRows(renamed)).not.toBe(digestCapturedVideoReviewRows(rows));
});

it('retains inspected source codecs while associating the same original container', async () => {
  const f = fixture();
  const rows = await freezeVideoReviewInTransaction(f.tx(), f.mediaId);
  rows.review.workspace.source.mimeType = 'video/webm; codecs="vp8, opus"';
  expect(parseCapturedVideoReviewRows(rows)?.review.workspace.source.mimeType).toBe(
    'video/webm; codecs="vp8, opus"'
  );
  rows.review.workspace.source.mimeType = 'video/mp4; codecs="avc1"';
  expect(parseCapturedVideoReviewRows(rows)).toBeNull();
});
