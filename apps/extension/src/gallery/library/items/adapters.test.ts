import { expect, it } from 'vitest';
import { createGalleryItems } from './adapters';
import { isGalleryMediaItem, isGallerySelectableItem, isGalleryVideoProjectItem } from './types';
import { createLibraryLifecycle } from '../../../composition/persistence/library-lifecycle';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';

function createMediaLibraryItem(overrides: Partial<MediaLibraryItem> = {}): MediaLibraryItem {
  return {
    id: 'asset-1',
    kind: 'image' as const,
    filename: 'capture.png',
    originalFilename: 'capture.png',
    mimeType: 'image/png',
    size: 256,
    createdAt: 10,
    updatedAt: 10,
    width: 1280,
    height: 720,
    duration: null,
    source: { kind: 'screenshot' as const },
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: ['media'],
    hasThumbnail: false,
    ...overrides,
  };
}

it('creates a mixed gallery list with scenario and export items sorted by freshness', () => {
  const scenarioProject = {
    id: 'project-1',
    name: 'Scenario',
    createdAt: 20,
    updatedAt: 25,
    lifecycle: createLibraryLifecycle('temporary', 25),
    tags: ['flow'],
  };
  const exportEntry = {
    id: 'export-1',
    projectId: 'project-1',
    format: 'html' as const,
    filename: 'scenario.html',
    createdAt: 30,
    size: 1024,
  };

  const items = createGalleryItems({
    mediaItems: [createMediaLibraryItem()],
    presentations: [
      {
        aggregateId: 'project-1',
        aggregateKind: 'scenario',
        presentationRevision: 0,
        thumbnailBlob: new Blob(['scenario']),
        updatedAt: 25,
      },
    ],
    scenarioExportsByProjectId: new Map([[scenarioProject.id, [exportEntry]]]),
    scenarioProjects: [scenarioProject],
    thumbnailIds: new Set(['scenario:project-1', 'scenario-export:export-1']),
    videoProjects: [],
  });

  expect(items.map((item) => item.id)).toEqual([
    'scenario-export:export-1',
    'scenario:project-1',
    'asset-1',
  ]);
  expectMixedGalleryItems(items);
});

function expectMixedGalleryItems(items: ReturnType<typeof createGalleryItems>): void {
  expect(items[0]).toMatchObject({
    filename: 'scenario.html',
    hasThumbnail: true,
    kind: 'scenario-export',
    lifecycle: { storageClass: 'temporary' },
    tags: ['flow'],
    type: 'scenario-export',
  });
  expect(items[1]).toMatchObject({
    entityId: 'project-1',
    filename: 'Scenario',
    hasThumbnail: true,
    kind: 'scenario',
    type: 'scenario',
  });
  expect(items[2]).toMatchObject({
    entityId: 'asset-1',
    hasThumbnail: false,
    kind: 'image',
    type: 'media',
  });
}

it('keeps scenario projects in the gallery even when exports or tags are missing', () => {
  const items = createGalleryItems({
    mediaItems: [],
    scenarioExportsByProjectId: new Map(),
    scenarioProjects: [{ id: 'project-2', name: 'Empty scenario', createdAt: 5, updatedAt: 6 }],
    thumbnailIds: new Set(),
    videoProjects: [],
  });

  expect(items).toEqual([
    expect.objectContaining({
      filename: 'Empty scenario',
      hasThumbnail: false,
      id: 'scenario:project-2',
      tags: [],
      type: 'scenario',
    }),
  ]);
});

it('creates video project gallery items with stable project thumbnails', () => {
  const items = createGalleryItems({
    mediaItems: [],
    presentations: [
      {
        aggregateId: 'project-1',
        aggregateKind: 'video-project',
        presentationRevision: 0,
        thumbnailBlob: new Blob(['video']),
        updatedAt: 20,
      },
    ],
    scenarioExportsByProjectId: new Map(),
    scenarioProjects: [],
    thumbnailIds: new Set(['video-project:project-1']),
    videoProjects: [
      {
        id: 'project-1',
        name: 'Launch cut',
        createdAt: 10,
        updatedAt: 20,
        duration: 30,
        width: 1280,
        height: 720,
        clipCount: 2,
        trackCount: 1,
        thumbnailId: 'video-project:project-1',
        thumbnailSourceMediaId: 'recording:recording-1',
        retentionKind: 'video',
      },
    ],
  });

  expect(items).toEqual([
    expect.objectContaining({
      entityId: 'project-1',
      filename: 'Launch cut',
      hasThumbnail: true,
      id: 'video-project:project-1',
      kind: 'video-project',
      thumbnailSourceMediaId: 'recording:recording-1',
      type: 'video-project',
      unavailableReason: null,
    }),
  ]);
  expect(isGalleryVideoProjectItem(items[0]!)).toBe(true);
  expect(isGallerySelectableItem(items[0]!)).toBe(true);
  expect(isGalleryMediaItem(items[0]!)).toBe(false);
});

it('links recording group members to their shared video project', () => {
  const recordingGroup = {
    groupId: 'capture-1',
    order: 0,
    role: 'display' as const,
    sourceLabel: 'Window 1',
  };
  const mediaItems = [
    createMediaLibraryItem({
      id: 'recording:window-1',
      kind: 'recording',
      recordingGroup,
      source: { kind: 'recording', recordingId: 'window-1' },
    }),
    createMediaLibraryItem({
      id: 'recording:webcam',
      kind: 'recording',
      recordingGroup: { ...recordingGroup, order: 1, role: 'webcam', sourceLabel: null },
      source: { kind: 'recording', recordingId: 'webcam' },
    }),
  ];
  const items = createGalleryItems({
    mediaItems,
    scenarioExportsByProjectId: new Map(),
    scenarioProjects: [],
    thumbnailIds: new Set(),
    videoProjects: [
      {
        clipCount: 2,
        createdAt: 10,
        duration: 30,
        height: 720,
        id: 'project-1',
        name: 'Grouped capture',
        recordingIds: ['window-1', 'webcam'],
        retentionKind: 'video',
        thumbnailId: 'video-project:project-1',
        thumbnailSourceMediaId: 'recording:window-1',
        trackCount: 2,
        updatedAt: 10,
        width: 1280,
      },
    ],
  });

  expect(items.filter(isGalleryMediaItem)).toEqual([
    expect.objectContaining({
      recordingGroupView: expect.objectContaining({
        memberCount: 2,
        projectId: 'project-1',
        projectName: 'Grouped capture',
        role: 'display',
      }),
    }),
    expect.objectContaining({
      recordingGroupView: expect.objectContaining({
        memberCount: 2,
        projectId: 'project-1',
        projectName: 'Grouped capture',
        role: 'webcam',
      }),
    }),
  ]);
});

it('keeps single recording metadata without presenting it as a recording group', () => {
  const items = createGalleryItems({
    mediaItems: [
      createMediaLibraryItem({
        id: 'recording:single',
        kind: 'recording',
        recordingGroup: {
          dimensions: { height: 1080, width: 1920 },
          groupId: 'single',
          order: 0,
          role: 'display',
          sourceLabel: 'Design review',
          sourceUrl: 'https://example.com/review',
        },
        source: { kind: 'recording', recordingId: 'single' },
      }),
    ],
    scenarioExportsByProjectId: new Map(),
    scenarioProjects: [],
    thumbnailIds: new Set(),
    videoProjects: [],
  });

  expect(items).toEqual([
    expect.objectContaining({
      recordingGroup: expect.objectContaining({
        dimensions: { height: 1080, width: 1920 },
        sourceLabel: 'Design review',
      }),
      source: { kind: 'recording', recordingId: 'single' },
    }),
  ]);
  expect(items[0]).not.toHaveProperty('recordingGroupView');
});
