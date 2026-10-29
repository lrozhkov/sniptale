import { releaseUnpublishedProjectAssets } from './delete-cascade.sources';
import { buildPhysicalDeleteOperation } from '../assets';
import { readReviewWorkspaceFixture } from './delete-cascade.test-support';
import { withVideoProjectUsage } from './usage-index-keys';
import { expect, it, vi } from 'vitest';
import { mediaId, physicalId, mediaEntry, rows, harness } from './delete-cascade.test-support';
import {
  deleteMediaAssetWithProjectCascade,
  StaleMediaAssetDeletePreviewError,
} from './delete-cascade';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import type { MediaAssetSource } from './contracts';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { deleteRecording } from '../recordings';
import { deleteProjectExport } from '../projects/index.exports';

vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: async () => harness.db(),
}));

vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: async () => [],
}));

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
  rows.get('video_projects')!.set(video.id, withVideoProjectUsage(video));
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
    expect(saved).toMatchObject({ usageReferenceKeys: ['indexed:v2'] });
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

it.each(
  (['private', 'published', 'external', 'root-self', 'missing', 'invalid'] as const).flatMap(
    (mode) =>
      (['music', 'watermark', 'presentation'] as const).map((resource) => ({ mode, resource }))
  )
)(
  'reclaims $resource after project purge according to identity ownership: $mode',
  async ({ mode, resource }) => {
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
    if (resource === 'watermark') {
      const { createQuickEditWatermark } =
        await import('../../../features/video/project/scene/watermark');
      advanced.audio.music = [];
      advanced.watermark = {
        ...createQuickEditWatermark('Remembered'),
        mode: 'none',
        image: {
          assetId: mode === 'root-self' ? mediaId : 'project-asset:private-music',
          width: 80,
          height: 40,
          size: 0.2,
          opacity: 1,
        },
      };
    }
    if (resource === 'presentation') {
      const { createNeutralPresentationSettings } =
        await import('../../../features/video/review/advanced/presentation');
      advanced.audio.music = [];
      advanced.presentation = createNeutralPresentationSettings();
      advanced.presentation.intro = {
        mode: 'none',
        image: {
          assetId: mode === 'root-self' ? mediaId : 'project-asset:private-music',
          width: 80,
          height: 40,
          duration: 3,
          fit: 'contain',
          fillColor: '#000000ff',
          crop: { panX: 0, panY: 0 },
        },
      };
    }
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
    rows.get('video_workspaces')!.delete(mediaId);
    const db = await harness.db();
    const tx = db.transaction([...rows.keys()], 'readwrite');
    await releaseUnpublishedProjectAssets(
      tx,
      new Set([mode === 'root-self' ? 'project-asset-1' : 'private-music']),
      buildPhysicalDeleteOperation([])
    );
    await tx.done;
    expect(rows.get('project_assets')?.has('private-music')).toBe(
      mode !== 'private' && mode !== 'missing'
    );
    expect(rows.get('asset_refs')?.has('music-body')).toBe(mode !== 'private');
  }
);

it('retains a private source and its auxiliaries while its own saved project remains', async () => {
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
  rows.get('video_workspaces')!.delete(mediaId);
  const db = await harness.db();
  const tx = db.transaction([...rows.keys()], 'readwrite');
  await releaseUnpublishedProjectAssets(tx, new Set(['a', 'b']), buildPhysicalDeleteOperation([]));
  await tx.done;
  expect(rows.get('project_assets')?.has('a')).toBe(true);
  expect(rows.get('project_assets')?.has('b')).toBe(true);
  expect(rows.get('video_workspaces')?.has('project-asset:a')).toBe(true);
});

it('confirmed image-origin purge strips active and remembered logos from the retained review graph', async () => {
  const { createQuickEditAdvancedState, createQuickEditAdvancedContent } =
    await import('../../../features/video/review/advanced/defaults');
  const { createQuickEditWatermark } =
    await import('../../../features/video/project/scene/watermark');
  const { parseVideoWorkspace } = await import('../review-workspaces/parser');
  const { collectReviewAssetReferences } = await import('../review-workspaces/asset-refs');
  installSource({ kind: 'screenshot' });
  rows.get('video_projects')!.clear();
  const watermark = {
    ...createQuickEditWatermark('Keep brand text'),
    mode: 'text' as const,
    image: { assetId: 'project-asset:private-logo', width: 80, height: 40, size: 0.2, opacity: 1 },
  };
  const before = { ...createQuickEditAdvancedContent(), watermark };
  rows.get('project_assets')!.set('private-logo', {
    id: 'private-logo',
    assetId: 'logo-body',
    mimeType: 'image/png',
    size: 5,
    createdAt: 1,
    originMediaId: mediaId,
  });
  rows.get('asset_refs')!.set('logo-body', { assetId: 'logo-body' });
  rows.get('asset_owners')!.set(JSON.stringify(['project-asset', 'private-logo', 'body']), {
    ownerKind: 'project-asset',
    ownerId: 'private-logo',
    role: 'body',
    assetId: 'logo-body',
  });
  rows.set(
    'video_workspaces',
    new Map([
      [
        'recording:other',
        {
          aggregateId: 'recording:other',
          formatVersion: 1,
          sourceAssetId: 'primary-physical',
          source: { duration: 2, width: 640, height: 360, size: 4, mimeType: 'video/webm' },
          revision: 1,
          cursor: 0,
          createdAt: 1,
          updatedAt: 1,
          advanced: {
            ...createQuickEditAdvancedState(),
            watermark,
            recoveryV1: JSON.stringify({ watermark: { ...watermark, mode: 'none' } }),
          },
          history: [
            {
              id: 'logo',
              at: 1,
              target: 'advancedContent',
              before,
              after: { ...before, watermark: { ...watermark, mode: 'image' } },
            },
          ],
        },
      ],
    ])
  );
  await deleteMediaAssetWithProjectCascade(mediaId, [
    { id: 'recording:other', kind: 'review', name: 'clip.webm', primary: false },
  ]);
  const review = parseVideoWorkspace(readReviewWorkspaceFixture('recording:other'));
  expect(review).not.toBeNull();
  expect(collectReviewAssetReferences(review!)).toEqual(new Set());
  expect(review!.advanced.watermark?.text).toEqual(watermark.text);
  expect(review!.advanced.watermark?.mode).toBe('text');
  expect(review!.advanced.watermark).not.toHaveProperty('image');
  expect(rows.get('project_assets')!.has('private-logo')).toBe(false);
  expect(rows.get('asset_refs')!.has('logo-body')).toBe(false);
});

it.each(['recording-1', 'restored'])(
  'deletes safety bytes atomically with admitted canonical deletion of %s',
  async (target) => {
    const source = { kind: 'recording' as const, recordingId: target };
    installSource(source);
    rows.get('video_projects')!.clear();
    rows.set(
      'recording_recovery_sessions',
      new Map([
        [
          'recording-1',
          {
            id: 'recording-1',
            recoveryId: 'restored',
            incarnation: 'one',
            epoch: 'epoch',
            filename: 'clip.webm',
            mimeType: 'video/webm',
            createdAt: 1,
            size: 3,
            blockCount: 1,
            complete: false,
            published: false,
          },
        ],
      ])
    );
    rows.set(
      'recording_recovery_blocks',
      new Map([
        [
          JSON.stringify(['recording-1', 0]),
          {
            id: 'recording-1',
            index: 0,
            incarnation: 'one',
            bytes: new Uint8Array([1, 2, 3]).buffer,
          },
        ],
      ])
    );
    await deleteMediaAssetWithProjectCascade(mediaId, []);
    expect(rows.get('recording_recovery_sessions')?.size).toBe(0);
    expect(rows.get('recording_recovery_blocks')?.size).toBe(0);
  }
);

it('preserves safety bytes when canonical deletion admission is refused', async () => {
  installSource({ kind: 'recording', recordingId: 'recording-1' });
  rows.set('recording_recovery_sessions', new Map([['recording-1', { id: 'recording-1' }]]));
  rows.set(
    'recording_recovery_blocks',
    new Map([['block', { id: 'recording-1', index: 0, bytes: new Uint8Array([1, 2, 3]).buffer }]])
  );
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toBeInstanceOf(
    StaleMediaAssetDeletePreviewError
  );
  expect(rows.get('recording_recovery_sessions')?.size).toBe(1);
  expect(rows.get('recording_recovery_blocks')?.size).toBe(1);
});

it('preserves the coordination epoch and unrelated recovery when deleting canonical recording @epoch', async () => {
  installSource({ kind: 'recording', recordingId: '@epoch' });
  rows.get('video_projects')!.clear();
  const epoch = { id: '@epoch', token: 'coordination-generation' };
  const unrelated = {
    id: 'unrelated',
    recoveryId: 'restored-unrelated',
    incarnation: 'one',
    epoch: 'coordination-generation',
    filename: 'clip.webm',
    mimeType: 'video/webm',
    createdAt: 1,
    size: 3,
    blockCount: 1,
    complete: false,
    published: false,
  };
  rows.set(
    'recording_recovery_sessions',
    new Map<string, unknown>([
      ['@epoch', epoch],
      ['unrelated', unrelated],
    ])
  );
  rows.set(
    'recording_recovery_blocks',
    new Map([
      [
        JSON.stringify(['unrelated', 0]),
        { id: 'unrelated', index: 0, incarnation: 'one', bytes: new Uint8Array([1, 2, 3]).buffer },
      ],
    ])
  );
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('recording_recovery_sessions')?.get('@epoch')).toEqual(epoch);
  expect(rows.get('recording_recovery_sessions')?.get('unrelated')).toEqual(unrelated);
  expect(rows.get('recording_recovery_blocks')?.size).toBe(1);
});

it('keeps the original canonical recording when deleting its restored copy and safety data', async () => {
  installSource({ kind: 'recording', recordingId: 'restored' });
  rows.get('video_projects')!.clear();
  const original = {
    id: 'original',
    assetId: 'original-asset',
    filename: 'original.webm',
    mimeType: 'video/webm',
    createdAt: 1,
    size: 3,
  };
  rows.get('recordings')!.set(original.id, original);
  rows.get('media_library')!.set('recording:original', {
    ...mediaEntry(),
    id: 'recording:original',
    source: { kind: 'recording', recordingId: 'original' },
  });
  rows.get('asset_owners')!.set(JSON.stringify(['recording', 'original', 'body']), {
    ownerKind: 'recording',
    ownerId: 'original',
    assetId: 'original-asset',
    role: 'body',
  });
  rows.set(
    'recording_recovery_sessions',
    new Map([
      [
        'original',
        {
          id: 'original',
          recoveryId: 'restored',
          incarnation: 'one',
          epoch: 'epoch',
          filename: 'original.webm',
          mimeType: 'video/webm',
          createdAt: 1,
          size: 3,
          blockCount: 1,
          complete: false,
          published: true,
        },
      ],
    ])
  );
  rows.set(
    'recording_recovery_blocks',
    new Map([
      [
        JSON.stringify(['original', 0]),
        { id: 'original', index: 0, incarnation: 'one', bytes: new Uint8Array([1, 2, 3]).buffer },
      ],
    ])
  );
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('recordings')?.get('original')).toEqual(original);
  expect(rows.get('media_library')?.has('recording:original')).toBe(true);
  expect(rows.get('asset_owners')?.has(JSON.stringify(['recording', 'original', 'body']))).toBe(
    true
  );
  expect(rows.get('recording_recovery_sessions')?.size).toBe(0);
  expect(rows.get('recording_recovery_blocks')?.size).toBe(0);
});

it.each(['recording', 'project-export'] as const)(
  'refuses the lower %s deletion when an archived quick project is the only source consumer',
  async (kind) => {
    const source =
      kind === 'recording'
        ? { kind, recordingId: 'recording-1' }
        : { kind, exportId: 'export-1', projectId: 'origin-project' };
    installSource(source);
    rows.get('video_projects')!.clear();
    const sourceMediaId = kind === 'recording' ? 'recording:recording-1' : 'export:export-1';
    rows.get('media_library')!.delete(mediaId);
    rows.get('media_library')!.set(sourceMediaId, { ...mediaEntry(), id: sourceMediaId, source });
    const archiveId = `${kind === 'recording' ? 'recording' : 'export'}:quick-project:retained`;
    rows.set(
      'video_workspaces',
      new Map([
        [
          archiveId,
          {
            aggregateId: archiveId,
            sourceMediaId,
            formatVersion: 3,
            sourceAssetId: physicalId,
            source: { duration: 2, width: 100, height: 100, size: 5, mimeType: 'video/webm' },
            revision: 1,
            cursor: 0,
            history: [],
            advanced: createQuickEditAdvancedState(),
            project: {
              name: 'Previous edit',
              lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
            },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      ])
    );
    expect(rows.get('video_workspaces')?.has(sourceMediaId)).toBe(false);
    const db = await harness.db();
    harness.db.mockResolvedValue({
      ...db,
      get: async (store: string, key: string) => rows.get(store)?.get(key),
    });
    const before = structuredClone(rows);
    const deletion =
      kind === 'recording' ? deleteRecording('recording-1') : deleteProjectExport('export-1');
    await expect(deletion).rejects.toThrow('primary source');
    expect(rows).toEqual(before);
    expect(rows.get('asset_refs')?.has(physicalId)).toBe(true);
    expect(harness.complete).not.toHaveBeenCalled();
  }
);
