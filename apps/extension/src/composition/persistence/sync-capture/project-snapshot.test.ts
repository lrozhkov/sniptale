import { expect, it } from 'vitest';
import { createVideoProjectAsset } from '../../../features/video/project/factories/creation';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';
import type { VideoProjectAssetSource } from '../../../features/video/project/types';
import type { VideoWorkspaceSnapshot } from '../review-workspaces/contracts';
import { workspace } from '../review-workspaces/backup-restore.test-support';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProjectEntry,
} from '../projects/index.test-support';
import type { AssetRef } from '../assets';
import type { CapturedVideoProjectRows } from './contracts';
import {
  collectCapturedProjectEditingMediaIds,
  isSupportedCaptureProject,
} from './project-snapshot';

const metadata = {
  width: 640,
  height: 360,
  duration: 2,
  mimeType: 'video/webm',
  size: 6,
  hasAudio: false,
  audioPeaks: null,
};

function ref(assetId: string): AssetRef {
  return {
    assetId,
    createdAt: 1,
    mimeType: metadata.mimeType,
    size: metadata.size,
    sha256: null,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
  };
}

function material(id: string, source: VideoProjectAssetSource) {
  return { ...createVideoProjectAsset(id, 'VIDEO', source, metadata), id };
}

function review(
  aggregateId: string,
  sourceAssetId: string,
  selectedChild: string
): VideoWorkspaceSnapshot {
  return {
    workspace: {
      ...workspace,
      aggregateId,
      sourceAssetId,
      history: [],
      cursor: 0,
      advanced: {
        ...workspace.advanced,
        webcam: createQuickEditWebcam(`project-asset:${selectedChild}`, metadata, metadata),
      },
    },
    draft: null,
  };
}

function setup(): CapturedVideoProjectRows & { reviews: VideoWorkspaceSnapshot[] } {
  const childIds = ['first', 'second', 'nested', 'shared', 'export-only', 'export-deep'];
  const assets = childIds.map((id) =>
    createProjectAssetEntry({
      id,
      assetId: `bytes-${id}`,
      size: metadata.size,
      mimeType: metadata.mimeType,
      originMediaId: `${id}-origin`,
    })
  );
  const project = createVideoProjectEntry({
    assets: [
      material('first-material', {
        kind: 'project-asset',
        projectAssetId: 'first',
        originMediaId: 'declared-origin',
      }),
      material('second-material', { kind: 'project-asset', projectAssetId: 'second' }),
      material('shared-material', { kind: 'project-asset', projectAssetId: 'shared' }),
      material('library-material', { kind: 'library-asset', mediaId: 'library-direct' }),
    ],
  });
  const exported = createProjectExportEntry({
    id: 'output',
    projectId: project.id,
    assetId: 'bytes-output',
    size: metadata.size,
    mimeType: metadata.mimeType,
  });
  const sourceMedia = [
    ...childIds.map((id) => `${id}-origin`),
    'declared-origin',
    'library-direct',
  ];
  return {
    project,
    assets,
    exports: [exported],
    media: [
      ...sourceMedia.map((id) =>
        createMediaLibraryEntry({
          id,
          source: { kind: 'stored-asset', assetId: `bytes-${id}` },
          size: metadata.size,
          mimeType: metadata.mimeType,
        })
      ),
      createMediaLibraryEntry({
        id: 'project-asset:shared',
        source: { kind: 'project-asset', projectAssetId: 'shared' },
        size: metadata.size,
        mimeType: metadata.mimeType,
      }),
    ],
    refs: [
      ...assets.map((asset) => ref(asset.assetId)),
      ref(exported.assetId),
      ...sourceMedia.map((id) => ref(`bytes-${id}`)),
    ],
    reviews: [
      review('project-asset:first', 'bytes-first', 'nested'),
      review('project-asset:second', 'bytes-second', 'nested'),
      review('project-asset:nested', 'bytes-nested', 'first'),
      review('export:output', 'bytes-output', 'export-only'),
      review('project-asset:export-only', 'bytes-export-only', 'export-deep'),
    ],
  };
}

it('selects direct Library sources, declared and child origins, and existing selected media mirrors', () => {
  const rows = setup();
  rows.reviews = [];
  expect(collectCapturedProjectEditingMediaIds(rows)).toEqual(
    new Set([
      'declared-origin',
      'library-direct',
      'first-origin',
      'second-origin',
      'shared-origin',
      'project-asset:shared',
    ])
  );
});

it('traverses recursive private review sources once and terminates on a cycle', () => {
  const rows = setup();
  const before = structuredClone(rows);
  expect(collectCapturedProjectEditingMediaIds(rows)).toEqual(
    new Set([
      'declared-origin',
      'library-direct',
      'first-origin',
      'second-origin',
      'shared-origin',
      'project-asset:shared',
      'nested-origin',
    ])
  );
  expect(rows).toEqual(before);
});

it('deduplicates a retained resource selected by two private reviews and a direct project material', () => {
  const rows = setup();
  rows.project.project.assets.push(
    material('nested-material', { kind: 'project-asset', projectAssetId: 'nested' })
  );
  const ids = collectCapturedProjectEditingMediaIds(rows);
  expect([...ids].filter((id) => id === 'nested-origin')).toHaveLength(1);
  expect(ids.size).toBe(7);
});

it('excludes supplementary media reachable only through an export review and its private review descendants', () => {
  const rows = setup();
  const ids = collectCapturedProjectEditingMediaIds(rows);
  expect(ids.has('export-only-origin')).toBe(false);
  expect(ids.has('export-deep-origin')).toBe(false);
  rows.project.project.assets.push(
    material('newly-selected', { kind: 'project-asset', projectAssetId: 'export-only' })
  );
  const nowSelected = collectCapturedProjectEditingMediaIds(rows);
  expect(nowSelected).toEqual(new Set([...ids, 'export-only-origin', 'export-deep-origin']));
});

it('does not manufacture a selected child media mirror when the frozen graph contains no mirror row', () => {
  const rows = setup();
  rows.media = rows.media.filter((entry) => entry.id !== 'project-asset:shared');
  const ids = collectCapturedProjectEditingMediaIds(rows);
  expect(ids.has('shared-origin')).toBe(true);
  expect(ids.has('project-asset:shared')).toBe(false);
});

it('admits authored focus paths and refuses recording source bindings before graph capture', () => {
  const project = createVideoProjectEntry().project;
  project.cursorFocusPath = {
    version: 1,
    mode: 'fixed',
    smoothing: 0,
    sensitivity: 1,
    gapPolicy: 'hold',
    segments: [{ id: 'focus', binding: { kind: 'project' }, start: 0, end: 1, keys: [] }],
  };
  expect(isSupportedCaptureProject(project)).toBe(true);
  project.cursorFocusPath.segments[0]!.binding = {
    kind: 'recording-source',
    recordingId: 'external-recording',
    sourceInstanceId: 'instance',
  };
  expect(isSupportedCaptureProject(project)).toBe(false);
});
