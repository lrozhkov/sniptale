import { expect, it } from 'vitest';
import { createGalleryItems } from './adapters';
import { isGalleryMediaItem, isGallerySelectableItem, isGalleryVideoProjectItem } from './types';

function createMediaLibraryItem() {
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
  };
}

it('creates a mixed gallery list with scenario and export items sorted by freshness', () => {
  const scenarioProject = {
    id: 'project-1',
    name: 'Scenario',
    createdAt: 20,
    updatedAt: 25,
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
