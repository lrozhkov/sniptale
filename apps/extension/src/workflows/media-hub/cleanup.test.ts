import { describe, expect, it } from 'vitest';

import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import type { ProjectExportEntry } from '../../composition/persistence/projects/contracts';
import type { RecordingEntry } from '../../composition/persistence/recordings/contracts';
import { createVideoProject } from '../../composition/persistence/projects/index.test-support.ts';
import {
  VideoProjectAssetType,
  type VideoProject,
  type VideoProjectAsset,
  type VideoProjectAssetSource,
} from '../../features/video/project/types/model';

import { buildCleanupCandidates, sumBytes } from './cleanup';
import type { StorageCleanupInventory } from './cleanup.inventory';
import { createCleanupWebSnapshotRecord } from './cleanup.test-support';

function createMediaItem(overrides: Partial<MediaLibraryItem> = {}): MediaLibraryItem {
  return {
    createdAt: overrides.createdAt ?? 0,
    duration: overrides.duration ?? null,
    filename: overrides.filename ?? 'asset.png',
    hasThumbnail: overrides.hasThumbnail ?? false,
    height: overrides.height ?? null,
    id: overrides.id ?? 'asset-1',
    kind: overrides.kind ?? 'screenshot',
    mimeType: overrides.mimeType ?? 'image/png',
    originalFilename: overrides.originalFilename ?? 'asset.png',
    size: overrides.size ?? 100,
    source:
      overrides.source ??
      ({
        kind: 'screenshot',
      } as MediaLibraryItem['source']),
    sourceFavicon: overrides.sourceFavicon ?? null,
    sourceTitle: overrides.sourceTitle ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
    tags: overrides.tags ?? [],
    updatedAt: overrides.updatedAt ?? overrides.createdAt ?? 0,
    width: overrides.width ?? null,
  };
}

function createRecording(
  overrides: Partial<Omit<RecordingEntry, 'blob'>> = {}
): Omit<RecordingEntry, 'blob'> {
  return {
    createdAt: overrides.createdAt ?? 0,
    filename: overrides.filename ?? 'recording.webm',
    id: overrides.id ?? 'recording-1',
    size: overrides.size ?? 1000,
  };
}

function createProjectExport(overrides: Partial<ProjectExportEntry> = {}): ProjectExportEntry {
  return {
    createdAt: overrides.createdAt ?? 0,
    duration: overrides.duration ?? 20,
    filename: overrides.filename ?? 'export.mp4',
    ...(overrides.format === undefined ? {} : { format: overrides.format }),
    fps: overrides.fps ?? 30,
    height: overrides.height ?? 1080,
    id: overrides.id ?? 'export-1',
    mimeType: overrides.mimeType ?? 'video/mp4',
    projectId: overrides.projectId ?? 'project-1',
    recordingId: overrides.recordingId ?? 'recording-export',
    size: overrides.size ?? 4000,
    width: overrides.width ?? 1920,
  };
}

function createProject(
  overrides: {
    assets?: VideoProjectAsset[];
    baseRecordingId?: string | null;
  } = {}
): VideoProject {
  return createVideoProject({
    assets: overrides.assets ?? [],
    baseRecordingId: overrides.baseRecordingId ?? null,
  });
}

function createProjectAsset(
  id: string,
  source: VideoProjectAssetSource,
  type: VideoProjectAssetType = VideoProjectAssetType.IMAGE
): VideoProjectAsset {
  return {
    id,
    createdAt: 1,
    metadata: {
      audioPeaks: null,
      duration: type === VideoProjectAssetType.IMAGE ? null : 4,
      hasAudio: type !== VideoProjectAssetType.IMAGE,
      height: 720,
      mimeType: type === VideoProjectAssetType.IMAGE ? 'image/png' : 'video/webm',
      size: 100,
      width: 1280,
    },
    name: id,
    source,
    type,
  };
}

function createCleanupMediaItems(now: number): MediaLibraryItem[] {
  return [
    createMediaItem({
      createdAt: now - 1_000,
      filename: 'recent.png',
      id: 'recent-shot',
      kind: 'screenshot',
      size: 300,
    }),
    createMediaItem({
      createdAt: now - 40 * 24 * 60 * 60 * 1000,
      filename: 'old-shot.png',
      id: 'old-shot',
      kind: 'screenshot',
      size: 50,
    }),
    createMediaItem({
      filename: 'clip.webm',
      id: 'recording-asset',
      kind: 'recording',
      size: 900,
      source: { kind: 'recording', recordingId: 'recording-ref' },
    }),
    createMediaItem({
      filename: 'export.mp4',
      id: 'export-asset',
      kind: 'video',
      size: 1200,
      source: {
        exportId: 'export-1',
        kind: 'project-export',
        projectId: 'project-1',
        recordingId: 'recording-export',
      },
    }),
    ...createWebSnapshotCleanupMediaItems(),
  ];
}

function createWebSnapshotCleanupMediaItems(): MediaLibraryItem[] {
  return [
    createMediaItem({
      filename: 'snapshot.zip',
      id: 'web-snapshot-missing',
      kind: 'web-archive',
      size: 700,
      source: { kind: 'web-snapshot', snapshotId: 'snapshot-missing' },
    }),
    createMediaItem({
      filename: 'snapshot-ok.zip',
      id: 'web-snapshot-ok',
      kind: 'web-archive',
      size: 650,
      source: { kind: 'web-snapshot', snapshotId: 'snapshot-ok' },
    }),
  ];
}

function createCleanupFixture(now: number) {
  return {
    mediaItems: createCleanupMediaItems(now),
    projectDetails: [
      createProject({
        assets: [
          createProjectAsset(
            'recording-project-asset',
            { kind: 'recording', recordingId: 'recording-project' },
            VideoProjectAssetType.VIDEO
          ),
        ],
        baseRecordingId: 'recording-base',
      }),
      null,
    ],
    projectExports: [createProjectExport()],
    projectAssets: [
      {
        id: 'project-asset-orphan',
        filename: 'unused.png',
        mimeType: 'image/png',
        createdAt: 130,
        size: 600,
      },
      {
        id: 'project-asset-used',
        filename: 'used.png',
        mimeType: 'image/png',
        createdAt: 140,
        size: 700,
      },
    ],
    recordings: [
      createRecording({ createdAt: 40, id: 'orphan-old', size: 100 }),
      createRecording({ createdAt: 90, id: 'recording-ref', size: 200 }),
      createRecording({ createdAt: 100, id: 'recording-export', size: 300 }),
      createRecording({ createdAt: 110, id: 'orphan-new', size: 400 }),
    ],
  };
}

function verifyCleanupCandidates(cleanup: ReturnType<typeof buildCleanupCandidates>) {
  expect(cleanup.orphanedRawRecordings).toEqual([
    expect.objectContaining({ id: 'orphan-new', kind: 'recording', target: 'recording' }),
    expect.objectContaining({ id: 'orphan-old', kind: 'recording', target: 'recording' }),
  ]);
  expect(cleanup.heavyFiles).toEqual([
    expect.objectContaining({ id: 'export-asset', size: 1200, target: 'asset' }),
    expect.objectContaining({ id: 'recording-asset', size: 900, target: 'asset' }),
  ]);
  expect(cleanup.oldScreenshots).toEqual([
    expect.objectContaining({ id: 'old-shot', filename: 'old-shot.png', kind: 'screenshot' }),
  ]);
}

function verifyBuildCleanupCandidates() {
  const fixture = createCleanupFixture(Date.now());
  const cleanup = buildCleanupCandidates({
    ...fixture,
    projectDetails: [
      createProject({
        assets: [
          createProjectAsset('project-asset-used', {
            kind: 'project-asset',
            projectAssetId: 'project-asset-used',
          }),
        ],
        baseRecordingId: 'recording-base',
      }),
    ],
    topN: 2,
    rawInventory: {
      diagnostics: [],
      editorSessions: [],
      scenarioExports: [],
      pendingScenarioAssets: [],
      scenarioAssets: [],
      scenarioProjects: [],
      scenarioStepDocuments: [],
      thumbnails: [],
      videoProjects: [],
      webSnapshots: [createCleanupWebSnapshotRecord('snapshot-ok')],
    } satisfies StorageCleanupInventory,
  });

  verifyCleanupCandidates(cleanup);
  expect(cleanup.brokenMediaMirrors).toEqual([
    expect.objectContaining({ id: 'web-snapshot-missing', kind: 'web-archive', target: 'asset' }),
  ]);
  expect(cleanup.orphanedProjectAssets).toEqual([
    expect.objectContaining({
      id: 'project-asset-orphan',
      target: 'project-asset',
    }),
  ]);
}

describe('media-hub-cleanup utilities', () => {
  it('sums byte sizes from arbitrary candidate lists', () => {
    expect(sumBytes([{ size: 0 }, { size: 12 }, { size: 88 }])).toBe(100);
  });

  it(
    'builds orphaned, heavy, and old screenshot cleanup groups from mixed media state',
    verifyBuildCleanupCandidates
  );
});
