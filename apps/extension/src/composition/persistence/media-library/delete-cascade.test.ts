import { readReviewWorkspaceFixture } from './delete-cascade.test-support';
import { expect, it } from 'vitest';
import { harness, mediaId, physicalId, mediaEntry, rows } from './delete-cascade.test-support';
import {
  deleteMediaAssetWithProjectCascade,
  StaleMediaAssetDeletePreviewError,
} from './delete-cascade';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { createQuickEditAdvancedContent } from '../../../features/video/review/advanced/defaults';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import { withReviewWorkspaceUsage } from './usage-index-keys';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { workspaceStorageHead, workspaceStorageRows } from '../review-workspaces/storage-format';

it('atomically removes placements, library metadata and the last physical owner', async () => {
  const project = [...rows.get('video_projects')!.values()][0] as ReturnType<
    typeof createVideoProjectEntryWithMediaClip
  >;
  await deleteMediaAssetWithProjectCascade(mediaId, [
    { id: project.id, kind: 'video', name: project.project.name, primary: false },
  ]);
  const saved = rows.get('video_projects')!.get(project.id) as typeof project;
  expect(saved.project.assets).toEqual([]);
  expect(saved.project.clips).toEqual([]);
  expect(saved.workspaceRevision).toBe(1);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('project_assets')?.has('project-asset-1')).toBe(false);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(false);
  expect(harness.complete).toHaveBeenCalledTimes(1);
});

it('rolls back when a new project use was not in the user warning', async () => {
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toBeInstanceOf(
    StaleMediaAssetDeletePreviewError
  );
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  expect(rows.get('video_projects')!.size).toBe(1);
  expect(harness.complete).not.toHaveBeenCalled();
});

it('deletes an unreferenced library source and its final physical object', async () => {
  rows.get('video_projects')!.clear();
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(false);
  expect(harness.complete).toHaveBeenCalledTimes(1);
});

it('keeps shared physical bytes when another owner remains', async () => {
  rows.get('video_projects')!.clear();
  rows.get('asset_owners')!.set(JSON.stringify(['scenario-asset', 'other', 'body']), {
    assetId: physicalId,
    ownerId: 'other',
    ownerKind: 'scenario-asset',
    role: 'body',
  });
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(true);
  expect(rows.get('asset_operations')?.size ?? 0).toBe(0);
  expect(harness.complete).not.toHaveBeenCalled();
});

it('keeps the committed deletion intent when physical cleanup must retry', async () => {
  rows.get('video_projects')!.clear();
  harness.complete.mockRejectedValueOnce(new Error('OPFS unavailable'));
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toThrow('OPFS unavailable');
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('asset_operations')?.size).toBe(1);
});

it('refuses to delete a recording required as a video primary source', async () => {
  const project = [...rows.get('video_projects')!.values()][0] as ReturnType<
    typeof createVideoProjectEntryWithMediaClip
  >;
  project.project.baseRecordingId = 'recording-1';
  rows.get('video_projects')!.set(project.id, project);
  rows.get('media_library')!.set(mediaId, {
    ...mediaEntry(),
    source: { kind: 'recording', recordingId: 'recording-1' },
  });
  await expect(
    deleteMediaAssetWithProjectCascade(mediaId, [
      { id: project.id, kind: 'video', name: project.project.name, primary: true },
    ])
  ).rejects.toThrow('primary source');
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  expect(harness.complete).not.toHaveBeenCalled();
});

it('fails closed on an invalid project row without deleting the file', async () => {
  rows.get('video_projects')!.set('invalid', { id: 'invalid' });
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  expect(harness.complete).not.toHaveBeenCalled();
});

it.each([
  ['music', 1, false],
  ['voiceover', 1, false],
  ['music', 2, false],
  ['voiceover', 2, false],
  ['music', 2, true],
] as const)(
  'purges auxiliary %s in format %i, invalid baseline=%s',
  async (lane, formatVersion, invalidBaseline) => {
    const advanced = createQuickEditAdvancedState();
    advanced.audio[lane].push({
      id: 'music',
      assetId: mediaId,
      timelineStart: 0,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    });
    advanced.audio.original.mutes = [
      { id: 'detached', kind: 'range', start: 1, end: 2, volume: 0.5 },
    ];
    if (lane === 'voiceover') {
      advanced.audio.voiceoverSegments = buildReviewTimeMap(2, []);
      advanced.audio.original.mutes.push({ id: 'take-mute', kind: 'take', clipId: 'music' });
    }
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
            history: [],
            advanced,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      ])
    );
    if (formatVersion === 2) {
      const previous = parseVideoWorkspace(rows.get('video_workspaces')!.get('recording:other'));
      if (!previous) throw new Error('Invalid review fixture');
      const workspace = {
        ...previous,
        formatVersion: 2 as const,
        baseline: replayReviewHistory(
          [],
          0,
          previous.source,
          reviewAdvancedContentBaseline(previous.advanced)
        ),
      };
      rows
        .get('video_workspaces')!
        .set(
          workspace.aggregateId,
          workspaceStorageHead(workspace, withReviewWorkspaceUsage(workspace).usageReferenceKeys)
        );
      const historyRows = workspaceStorageRows(workspace);
      if (invalidBaseline) {
        const baselineRow = historyRows.find((row) => 'baseline' in row);
        if (!baselineRow || !('baseline' in baselineRow)) throw new Error('Missing baseline');
        baselineRow.baseline.edits = [
          { id: 'invalid-cut', kind: 'cut', start: 2, end: 1, requestedStart: 2, requestedEnd: 1 },
        ];
      }
      rows.set(
        'video_workspace_history',
        new Map(historyRows.map((row) => [JSON.stringify([row.aggregateId, row.ordinal]), row]))
      );
    }
    const project = [...rows.get('video_projects')!.values()][0] as ReturnType<
      typeof createVideoProjectEntryWithMediaClip
    >;
    if (invalidBaseline) {
      const snapshot = structuredClone(rows);
      await expect(
        deleteMediaAssetWithProjectCascade(mediaId, [
          { id: project.id, kind: 'video', name: project.project.name, primary: false },
          { id: 'recording:other', kind: 'review', name: 'clip.webm', primary: false },
        ])
      ).rejects.toMatchObject({ reason: 'invalid-graph' });
      expect([...rows].map(([name, store]) => [name, [...store]])).toEqual(
        [...snapshot].map(([name, store]) => [name, [...store]])
      );
      expect(harness.complete).not.toHaveBeenCalled();
      return;
    }
    await deleteMediaAssetWithProjectCascade(mediaId, [
      { id: project.id, kind: 'video', name: project.project.name, primary: false },
      { id: 'recording:other', kind: 'review', name: 'clip.webm', primary: false },
    ]);
    const review = parseVideoWorkspace(readReviewWorkspaceFixture('recording:other'));
    expect(review).not.toBeNull();
    expect(review!.advanced.audio[lane]).toEqual([]);
    expect(review!.advanced.audio.original.mutes).toEqual([
      { id: 'detached', kind: 'range', start: 1, end: 2, volume: 0.5 },
    ]);
    expect(review!.revision).toBe(2);
    expect(rows.get('media_library')?.has(mediaId)).toBe(false);
    expect(harness.complete).toHaveBeenCalledTimes(1);
  }
);

it('detaches a disabled webcam held only by redo history when its Library origin is deleted', async () => {
  const source = { duration: 2, width: 100, height: 100, size: 5, mimeType: 'video/webm' };
  const before = createQuickEditAdvancedContent();
  const webcam = {
    ...createQuickEditWebcam('project-asset:private-camera', source, source),
    enabled: false,
  };
  rows.get('project_assets')!.set('private-camera', {
    id: 'private-camera',
    assetId: 'camera-body',
    mimeType: 'video/webm',
    size: 5,
    createdAt: 1,
    originMediaId: mediaId,
  });
  rows.get('asset_refs')!.set('camera-body', { assetId: 'camera-body' });
  rows.get('asset_owners')!.set(JSON.stringify(['project-asset', 'private-camera', 'body']), {
    ownerKind: 'project-asset',
    ownerId: 'private-camera',
    role: 'body',
    assetId: 'camera-body',
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
          source,
          revision: 1,
          cursor: 0,
          advanced: createQuickEditAdvancedState(),
          createdAt: 1,
          updatedAt: 1,
          history: [
            {
              id: 'attach',
              at: 1,
              target: 'advancedContent',
              before,
              after: { ...before, webcam },
            },
          ],
        },
      ],
    ])
  );
  rows.get('video_projects')!.clear();
  await deleteMediaAssetWithProjectCascade(mediaId, [
    { id: 'recording:other', kind: 'review', name: 'clip.webm', primary: false },
  ]);
  const review = parseVideoWorkspace(readReviewWorkspaceFixture('recording:other'));
  expect(review).not.toBeNull();
  expect(review!.history).toEqual([]);
  expect(review!.advanced.webcam).toBeUndefined();
  expect(review!.cursor).toBe(0);
  expect(rows.get('project_assets')!.has('private-camera')).toBe(false);
  expect(rows.get('asset_refs')!.has('camera-body')).toBe(false);
});

it('retains a primary source while its own quick-edit project exists', async () => {
  rows.get('video_projects')!.clear();
  rows.set(
    'video_workspaces',
    new Map([
      [
        mediaId,
        {
          aggregateId: mediaId,
          formatVersion: 1,
          sourceAssetId: physicalId,
          source: { duration: 2, width: 100, height: 100, size: 5, mimeType: 'video/webm' },
          revision: 1,
          cursor: 0,
          history: [],
          advanced: createQuickEditAdvancedState(),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    ])
  );
  const before = structuredClone(rows);
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toThrow('primary source');
  expect(rows).toEqual(before);
});

it('ignores unrelated invalid scenario metadata with a known disjoint project identity', async () => {
  rows.get('video_projects')!.clear();
  rows.set('scenario_projects', new Map([['other', { id: 'other', invalid: true }]]));
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('scenario_projects')?.has('other')).toBe(true);
});

it('ignores invalid metadata on a scenario child with disjoint dependency locators', async () => {
  rows.get('video_projects')!.clear();
  rows.set(
    'scenario_assets',
    new Map([
      [
        'other',
        {
          id: 'other',
          assetId: 'other-physical',
          galleryAssetId: 'other-library',
          borrowedMediaId: 'other-library',
        },
      ],
    ])
  );
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('scenario_assets')?.has('other')).toBe(true);
});

it('retains a source when its own quick-edit project evidence is invalid', async () => {
  rows.get('video_projects')!.clear();
  rows.set('video_workspaces', new Map([[mediaId, { aggregateId: mediaId, invalid: true }]]));
  const before = structuredClone(rows);
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toThrow();
  expect(rows).toEqual(before);
});

it('does not validate unrelated quick-edit rows for a stored image source', async () => {
  rows.get('video_projects')!.clear();
  rows.set('video_workspaces', new Map([['other', { aggregateId: 'other', invalid: true }]]));
  const media = {
    ...mediaEntry(),
    kind: 'image',
    source: { kind: 'stored-asset', assetId: physicalId },
  };
  rows.get('media_library')!.set(mediaId, media);
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('video_workspaces')?.has('other')).toBe(true);
});

it('ignores unrelated video entry metadata only when its complete project document proves no use', async () => {
  const entry = createVideoProjectEntryWithMediaClip();
  entry.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'other-source' };
  rows.get('video_projects')!.clear();
  rows.get('video_projects')!.set(entry.id, { ...entry, updatedAt: 'invalid' });
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('video_projects')?.has(entry.id)).toBe(true);
});

it('refuses related invalid scenario children and retains every store', async () => {
  rows.get('video_projects')!.clear();
  rows.set(
    'scenario_assets',
    new Map([['related', { id: 'related', assetId: physicalId, borrowedMediaId: mediaId }]])
  );
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
    graphDomain: 'scenario-asset',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(true);
});

it('refuses ambiguous scenario dependency locators', async () => {
  rows.get('video_projects')!.clear();
  rows.set(
    'scenario_assets',
    new Map([['unknown', { id: 'unknown', assetId: physicalId, borrowedMediaId: 42 }]])
  );
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
    graphDomain: 'scenario-asset',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
});

it('refuses invalid video metadata when the domain document references the selected media', async () => {
  const entry = createVideoProjectEntryWithMediaClip();
  rows.get('video_projects')!.set(entry.id, { ...entry, updatedAt: 'invalid' });
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
    graphDomain: 'video-project',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
});

it.each([true, false])(
  'refuses a related invalid scenario root (borrowed=%s)',
  async (borrowed) => {
    rows.get('video_projects')!.clear();
    rows.set(
      'scenario_assets',
      new Map([
        [
          'child',
          {
            id: 'child',
            assetId: physicalId,
            projectId: 'related',
            galleryAssetId: mediaId,
            ...(borrowed ? { borrowedMediaId: mediaId } : {}),
            mimeType: 'image/png',
            width: 100,
            height: 100,
            size: 5,
            createdAt: 1,
          },
        ],
      ])
    );
    rows.set('scenario_projects', new Map([['related', { id: 'related', invalid: true }]]));
    await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
      reason: 'invalid-graph',
      graphDomain: 'scenario-project',
    });
    expect(rows.get('scenario_assets')?.has('child')).toBe(true);
    expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  }
);

it('retains a stored image used by an invalid child with legacy empty borrowing', async () => {
  rows.get('video_projects')!.clear();
  rows
    .get('media_library')!
    .set(mediaId, { ...mediaEntry(), source: { kind: 'stored-asset', assetId: physicalId } });
  rows.set(
    'scenario_assets',
    new Map([['related', { id: 'related', assetId: physicalId, borrowedMediaId: '' }]])
  );
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
    graphDomain: 'scenario-asset',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
});

it.each(['timeline', 'effects', 'asset metadata'] as const)(
  'ignores disjoint video %s failures while preserving the project record',
  async (failure) => {
    const entry = createVideoProjectEntryWithMediaClip();
    entry.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'other-source' };
    const project = {
      ...entry.project,
      ...(failure === 'timeline' ? { tracks: 'invalid' } : {}),
      ...(failure === 'effects' ? { effectSnapshots: 'invalid' } : {}),
      ...(failure === 'asset metadata'
        ? {
            assets: entry.project.assets.map((asset) => ({
              ...asset,
              metadata: { ...asset.metadata, width: -1 },
            })),
          }
        : {}),
    };
    rows.get('video_projects')!.clear();
    const invalid = { ...entry, project };
    rows.get('video_projects')!.set(entry.id, invalid);
    await deleteMediaAssetWithProjectCascade(mediaId, []);
    expect(rows.get('media_library')?.has(mediaId)).toBe(false);
    expect(rows.get('video_projects')?.get(entry.id)).toEqual(invalid);
  }
);

it.each([
  { kind: 'library-asset', mediaId: 'other' },
  { kind: 'recording', recordingId: 'other' },
  { kind: 'project-asset', projectAssetId: 'other' },
  { kind: 'scenario-asset', scenarioAssetId: 'other' },
])('checks disjoint source identities despite invalid effects: %j', async (source) => {
  const entry = createVideoProjectEntryWithMediaClip();
  const project = {
    ...entry.project,
    effectSnapshots: 'invalid',
    assets: entry.project.assets.map((asset) => ({ ...asset, source })),
  };
  rows.get('video_projects')!.clear();
  rows.get('video_projects')!.set(entry.id, { ...entry, project });
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
});

it.each([
  { version: 1 },
  { templateInstances: [] },
  { assets: null },
  { assets: [null] },
  { assets: [{ source: { kind: 'unknown', mediaId } }] },
  { assets: [{ source: { kind: 'library-asset' } }] },
  { source: { kind: 'unknown' } },
  { source: { kind: 'recording' } },
  { source: { kind: 'scenario' } },
  { baseRecordingId: [] },
])('retains media when the video dependency envelope is ambiguous: %j', async (changes) => {
  const entry = createVideoProjectEntryWithMediaClip();
  rows
    .get('video_projects')!
    .set(entry.id, { ...entry, project: { ...entry.project, ...changes } });
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
    graphDomain: 'video-project',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
});

it.each(['base', 'origin'] as const)(
  'protects a recording used by an invalid project %s source',
  async (primary) => {
    const entry = createVideoProjectEntryWithMediaClip();
    const project = {
      ...entry.project,
      effectSnapshots: 'invalid',
      assets: [],
      baseRecordingId: primary === 'base' ? 'required' : null,
      source:
        primary === 'origin' ? { kind: 'recording', recordingId: 'required' } : { kind: 'manual' },
    };
    rows
      .get('media_library')!
      .set(mediaId, { ...mediaEntry(), source: { kind: 'recording', recordingId: 'required' } });
    rows.get('video_projects')!.clear();
    rows.get('video_projects')!.set(entry.id, { ...entry, project });
    await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
      reason: 'invalid-graph',
      graphDomain: 'video-project',
    });
    expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  }
);

it.each([
  { kind: 'recording', recordingId: 'other' },
  { kind: 'scenario', scenarioProjectId: 'other' },
])('accepts a disjoint project origin: %j', async (source) => {
  const entry = createVideoProjectEntryWithMediaClip();
  const project = { ...entry.project, source, assets: [], effectSnapshots: 'invalid' };
  rows.get('video_projects')!.clear();
  rows.get('video_projects')!.set(entry.id, { ...entry, project });
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
});

it('purges a secondary source from a text-capable project and retains independent authored text', async () => {
  const project = createVideoProjectEntryWithMediaClip({ version: 5 });
  const asset = project.project.assets[0]!;
  project.project.textDocuments = [
    {
      id: 'source-text',
      binding: { kind: 'source', assetId: asset.id, sourceInstanceId: 'source-placement' },
      document: { version: 1, fragments: [] },
    },
    {
      id: 'independent-text',
      binding: { kind: 'project' },
      document: { version: 1, fragments: [] },
    },
  ];
  rows.get('video_projects')!.clear();
  rows.get('video_projects')!.set(project.id, project);
  await deleteMediaAssetWithProjectCascade(mediaId, [
    { id: project.id, kind: 'video', name: project.project.name, primary: false },
  ]);
  const saved = rows.get('video_projects')!.get(project.id) as typeof project;
  expect(saved.project.textDocuments?.map(({ id }) => id)).toEqual(['independent-text']);
  expect(saved.project.assets).toEqual([]);
  expect(saved.project.clips).toEqual([]);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(false);
  expect(harness.complete).toHaveBeenCalledTimes(1);
});
