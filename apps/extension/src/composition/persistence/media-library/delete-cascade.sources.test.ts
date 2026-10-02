import { expect, it } from 'vitest';
import { mediaId, physicalId, mediaEntry, rows, harness } from './delete-cascade.test-support';
import {
  deleteMediaAssetWithProjectCascade,
  StaleMediaAssetDeletePreviewError,
} from './delete-cascade';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import type { MediaAssetSource } from './contracts';

const sources = [
  { kind: 'screenshot' },
  { kind: 'stored-asset', assetId: physicalId },
  { kind: 'recording', recordingId: 'recording-1' },
  { kind: 'project-asset', projectAssetId: 'project-asset-1' },
  { kind: 'project-export', exportId: 'export-1', projectId: 'origin-project' },
  { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
] satisfies MediaAssetSource[];

function installSource(source: MediaAssetSource) {
  rows.get('asset_owners')!.clear();
  rows.get('media_library')!.set(mediaId, {
    ...mediaEntry(),
    source,
    ...(source.kind === 'screenshot'
      ? { kind: 'image', mimeType: 'image/png', blob: new Blob(['png']) }
      : {}),
  });
  const own = (ownerKind: string, ownerId: string, assetId = physicalId, role = 'body') => {
    rows
      .get('asset_owners')!
      .set(JSON.stringify([ownerKind, ownerId, role]), { ownerKind, ownerId, assetId, role });
  };
  if (source.kind === 'recording') {
    rows.set(
      'recordings',
      new Map([
        [
          source.recordingId,
          {
            id: source.recordingId,
            assetId: physicalId,
            filename: 'clip.webm',
            mimeType: 'video/webm',
            size: 5,
            createdAt: 1,
          },
        ],
      ])
    );
    own('recording', source.recordingId);
  } else if (source.kind === 'project-asset') own('project-asset', source.projectAssetId);
  else if (source.kind === 'stored-asset') own('media-library', mediaId, physicalId, 'source');
  else if (source.kind === 'project-export') {
    rows.set(
      'project_exports',
      new Map([
        [
          source.exportId,
          {
            id: source.exportId,
            assetId: physicalId,
            projectId: source.projectId,
            filename: 'export.webm',
            size: 5,
            createdAt: 1,
            duration: 2,
            width: 100,
            height: 100,
            fps: 30,
          },
        ],
      ])
    );
    own('project-export', source.exportId);
  } else if (source.kind === 'web-snapshot') {
    rows.set(
      'web_snapshots',
      new Map([
        [
          source.snapshotId,
          {
            id: source.snapshotId,
            packageAssetId: physicalId,
            screenshotAssetId: 'snapshot-image',
            screenshotMimeType: 'image/png',
            screenshotSize: 3,
            size: 5,
            createdAt: 1,
            updatedAt: 1,
            manifest: createPagePackageManifestFixture({
              id: source.snapshotId,
              source: { faviconUrl: null, title: 'Page', url: 'https://example.com/' },
            }),
          },
        ],
      ])
    );
    own('web-snapshot', source.snapshotId, physicalId, 'package');
    own('web-snapshot', source.snapshotId, 'snapshot-image', 'screenshot');
    rows.get('asset_refs')!.set('snapshot-image', {
      assetId: 'snapshot-image',
      size: 3,
      mimeType: 'image/png',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'snapshot-image' },
    });
  }
  const video = createVideoProjectEntryWithMediaClip();
  video.project.assets[0]!.source = { kind: 'library-asset', mediaId };
  rows.get('video_projects')!.clear();
  rows.get('video_projects')!.set(video.id, video);
  return video;
}

it.each(sources)(
  'atomically removes confirmed $kind media and its video placements',
  async (source) => {
    const video = installSource(source);
    await deleteMediaAssetWithProjectCascade(mediaId, [
      { id: video.id, kind: 'video', name: video.project.name, primary: false },
    ]);
    expect(rows.get('media_library')?.has(mediaId)).toBe(false);
    const saved = rows.get('video_projects')!.get(video.id) as typeof video;
    expect(saved.project.assets).toEqual([]);
    expect(saved.project.clips).toEqual([]);
    if (source.kind !== 'screenshot') {
      expect(rows.get('asset_refs')?.has(physicalId)).toBe(false);
      expect(harness.complete).toHaveBeenCalledTimes(1);
    }
    if (source.kind === 'web-snapshot') {
      expect(rows.get('web_snapshots')?.size).toBe(0);
      expect(rows.get('asset_refs')?.has('snapshot-image')).toBe(false);
    }
    if (source.kind === 'project-export') expect(rows.get('project_exports')?.size).toBe(0);
  }
);

it.each(sources)('rolls back the whole $kind graph when confirmation is stale', async (source) => {
  installSource(source);
  const before = structuredClone(rows);
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toBeInstanceOf(
    StaleMediaAssetDeletePreviewError
  );
  expect(rows).toEqual(before);
  expect(harness.complete).not.toHaveBeenCalled();
});

it.each([false, true])(
  'releases a detached representation only when it is private (published=%s)',
  async (published) => {
    const video = installSource({ kind: 'screenshot' });
    video.project.assets[0]!.source = {
      kind: 'project-asset',
      projectAssetId: 'representation',
      originMediaId: mediaId,
    };
    rows.get('video_projects')!.set(video.id, video);
    rows.get('project_assets')!.set('representation', {
      id: 'representation',
      assetId: 'representation-object',
      size: 5,
      mimeType: 'video/webm',
      createdAt: 1,
    });
    rows.get('asset_refs')!.set('representation-object', {
      assetId: 'representation-object',
      size: 5,
      mimeType: 'video/webm',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'representation-object' },
    });
    rows.get('asset_owners')!.set(JSON.stringify(['project-asset', 'representation', 'body']), {
      assetId: 'representation-object',
      ownerKind: 'project-asset',
      ownerId: 'representation',
      role: 'body',
    });
    if (published)
      rows.get('media_library')!.set('project-asset:representation', {
        ...mediaEntry(),
        id: 'project-asset:representation',
        source: { kind: 'project-asset', projectAssetId: 'representation' },
      });
    await deleteMediaAssetWithProjectCascade(mediaId, [
      { id: video.id, kind: 'video', name: video.project.name, primary: false },
    ]);
    expect(rows.get('media_library')?.has(mediaId)).toBe(false);
    expect(rows.get('project_assets')?.has('representation')).toBe(published);
    expect(rows.get('asset_refs')?.has('representation-object')).toBe(published);
  }
);

it.each([
  {
    source: { kind: 'recording', recordingId: 'record' },
    domain: 'recording-assets',
    payload: { entries: [{ id: 'record' }] },
    unrelated: { entries: [{ id: 'other' }] },
  },
  {
    source: { kind: 'project-asset', projectAssetId: 'asset' },
    domain: 'project-assets',
    payload: { entry: { id: 'asset' } },
    unrelated: { entry: { id: 'other' } },
  },
  {
    source: { kind: 'project-export', exportId: 'export', projectId: 'p' },
    domain: 'project-exports',
    payload: { entry: { id: 'export' } },
    unrelated: { entry: { id: 'other' } },
  },
  {
    source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
    domain: 'web-snapshot-assets',
    payload: { snapshot: { id: 'snapshot' } },
    unrelated: { snapshot: { id: 'other' } },
  },
] satisfies Array<{
  source: MediaAssetSource;
  domain: string;
  payload: object;
  unrelated: object;
}>)(
  'prevents publication resurrection for $source.kind',
  async ({ source, domain, payload, unrelated }) => {
    const { mediaHasPendingPublication } = await import('./delete-cascade.sources');
    const target = { id: 'root', source };
    expect(mediaHasPendingPublication({ domain, payload }, target)).toBe(true);
    expect(mediaHasPendingPublication({ domain, payload: {} }, target)).toBe(true);
    expect(mediaHasPendingPublication({ domain, payload: unrelated }, target)).toBe(false);
  }
);

it('purges a private acquisition linked to the root before any project placement was saved', async () => {
  installSource({ kind: 'screenshot' });
  rows.get('video_projects')!.clear();
  rows.get('project_assets')!.set('acquired', {
    id: 'acquired',
    assetId: 'acquired-bytes',
    createdAt: 1,
    mimeType: 'image/png',
    size: 3,
    originMediaId: mediaId,
  });
  rows.get('asset_refs')!.set('acquired-bytes', {
    assetId: 'acquired-bytes',
    size: 3,
    mimeType: 'image/png',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'acquired-bytes' },
  });
  rows.get('asset_owners')!.set(JSON.stringify(['project-asset', 'acquired', 'body']), {
    ownerKind: 'project-asset',
    ownerId: 'acquired',
    role: 'body',
    assetId: 'acquired-bytes',
  });
  rows.set(
    'thumbnails',
    new Map([
      [
        'project-asset:acquired',
        { assetId: 'project-asset:acquired', blob: new Blob(['preview']) },
      ],
    ])
  );
  rows.set(
    'video_workspace_drafts',
    new Map([['project-asset:acquired', { aggregateId: 'project-asset:acquired' }]])
  );
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('project_assets')?.has('acquired')).toBe(false);
  expect(rows.get('thumbnails')?.has('project-asset:acquired')).toBe(false);
  expect(rows.get('video_workspace_drafts')?.has('project-asset:acquired')).toBe(false);
  expect(rows.get('asset_refs')?.has('acquired-bytes')).toBe(false);
});

it('retains the complete graph when the selected row contains a different Library identity', async () => {
  installSource({ kind: 'screenshot' });
  rows
    .get('media_library')!
    .set(mediaId, { ...(rows.get('media_library')!.get(mediaId) as object), id: 'different-root' });
  const before = structuredClone(rows);
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toThrow();
  expect(rows).toEqual(before);
});

it.each(['private', 'published', 'external', 'root-self', 'missing', 'invalid'] as const)(
  'reclaims review auxiliaries according to identity ownership: %s',
  async (mode) => {
    const { createQuickEditAdvancedState } =
      await import('../../../features/video/review/advanced/defaults');
    installSource(
      mode === 'root-self'
        ? { kind: 'project-asset', projectAssetId: 'project-asset-1' }
        : { kind: 'screenshot' }
    );
    rows.get('video_projects')!.clear();
    const advanced = createQuickEditAdvancedState();
    advanced.audio.music.push({
      id: 'music',
      assetId: mode === 'root-self' ? mediaId : 'project-asset:private-music',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    });
    rows.set(
      'video_workspaces',
      new Map([
        [
          mediaId,
          {
            aggregateId: mediaId,
            formatVersion: 1,
            sourceAssetId: 'review-source',
            source: { duration: 2, width: 100, height: 100, size: 5, mimeType: 'video/webm' },
            revision: 1,
            cursor: 0,
            history: [],
            advanced,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      ])
    );
    rows.get('project_assets')!.set('private-music', {
      id: 'private-music',
      assetId: 'music-body',
      mimeType: 'audio/mpeg',
      size: 3,
      createdAt: 1,
    });
    rows.get('asset_owners')!.set(JSON.stringify(['project-asset', 'private-music', 'body']), {
      ownerKind: 'project-asset',
      ownerId: 'private-music',
      role: 'body',
      assetId: 'music-body',
    });
    rows.get('asset_refs')!.set('music-body', { assetId: 'music-body' });
    if (mode === 'missing') rows.get('project_assets')!.delete('private-music');
    if (mode === 'invalid')
      rows
        .get('project_assets')!
        .set('private-music', { id: 'private-music', createdAt: 'invalid' });
    if (mode === 'published')
      rows.get('media_library')!.set('project-asset:private-music', {
        ...mediaEntry(),
        id: 'project-asset:private-music',
        source: { kind: 'project-asset', projectAssetId: 'private-music' },
        kind: 'audio',
        mimeType: 'audio/mpeg',
        size: 3,
      });
    if (mode === 'external') {
      const video = createVideoProjectEntryWithMediaClip({ id: 'external' });
      video.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'private-music' };
      rows.get('video_projects')!.set(video.id, video);
    }
    await deleteMediaAssetWithProjectCascade(mediaId, []);
    expect(rows.get('project_assets')?.has('private-music')).toBe(
      mode !== 'private' && mode !== 'missing'
    );
    expect(rows.get('asset_refs')?.has('music-body')).toBe(mode !== 'private');
  }
);

it('reconsiders private auxiliaries after their consuming workspace is released', async () => {
  const { createQuickEditAdvancedState } =
    await import('../../../features/video/review/advanced/defaults');
  installSource({ kind: 'screenshot' });
  rows.get('video_projects')!.clear();
  const advanced = createQuickEditAdvancedState();
  advanced.audio.music.push({
    id: 'music',
    assetId: 'project-asset:b',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  });
  rows.set(
    'video_workspaces',
    new Map([
      [
        'project-asset:a',
        {
          aggregateId: 'project-asset:a',
          formatVersion: 1,
          sourceAssetId: 'a-body',
          source: { duration: 2, width: 100, height: 100, size: 5, mimeType: 'video/webm' },
          revision: 1,
          cursor: 0,
          history: [],
          advanced,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    ])
  );
  for (const id of ['a', 'b']) {
    rows
      .get('project_assets')!
      .set(id, { id, assetId: `${id}-body`, mimeType: 'audio/mpeg', size: 3, createdAt: 1 });
    rows.get('asset_owners')!.set(JSON.stringify(['project-asset', id, 'body']), {
      ownerKind: 'project-asset',
      ownerId: id,
      role: 'body',
      assetId: `${id}-body`,
    });
    rows.get('asset_refs')!.set(`${id}-body`, { assetId: `${id}-body` });
  }
  const root = structuredClone(rows.get('video_workspaces')!.get('project-asset:a')) as {
    aggregateId: string;
    advanced: typeof advanced;
  };
  root.aggregateId = mediaId;
  root.advanced.audio.music.push({
    ...root.advanced.audio.music[0]!,
    id: 'second',
    assetId: 'project-asset:a',
  });
  rows.get('video_workspaces')!.set(mediaId, root);
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('project_assets')?.has('a')).toBe(false);
  expect(rows.get('project_assets')?.has('b')).toBe(false);
});
