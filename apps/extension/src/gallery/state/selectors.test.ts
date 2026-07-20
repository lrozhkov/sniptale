import { expect, it } from 'vitest';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import type { GalleryItem } from '../library/items';
import {
  getActiveStorageBarClass,
  getAllGalleryTags,
  getFilteredGalleryItems,
  getFilteredScenarioProjects,
  getGalleryCounts,
  getGalleryGridMetrics,
} from './selectors';

function createItem(overrides: Partial<MediaLibraryItem> = {}): MediaLibraryItem {
  const id = overrides.id ?? 'asset-1';

  return {
    id,
    kind: 'screenshot',
    source: { kind: 'screenshot' },
    filename: `${id}.png`,
    originalFilename: `${id}.png`,
    createdAt: 1,
    updatedAt: 1,
    size: 100,
    mimeType: 'image/png',
    width: 1280,
    height: 720,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    hasThumbnail: false,
    ...overrides,
  };
}

function createCountAndTagItems(): MediaLibraryItem[] {
  return [
    createItem({ id: 'shot', kind: 'screenshot', tags: ['beta', 'alpha'] }),
    createItem({
      id: 'image',
      kind: 'image',
      source: { kind: 'project-asset', projectAssetId: 'asset-1' },
      tags: ['gamma'],
    }),
    createItem({
      id: 'recording',
      kind: 'recording',
      source: { kind: 'recording', recordingId: 'rec-1' },
      tags: ['beta'],
    }),
    createItem({
      id: 'video',
      kind: 'video',
      source: {
        kind: 'project-export',
        exportId: 'exp-1',
        recordingId: 'rec-2',
        projectId: 'p-1',
      },
      tags: ['delta'],
    }),
    createItem({
      id: 'export',
      kind: 'export',
      source: {
        kind: 'project-export',
        exportId: 'exp-2',
        recordingId: 'rec-3',
        projectId: 'p-1',
      },
      tags: ['alpha'],
    }),
    createItem({
      id: 'web',
      kind: 'web-archive',
      source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
      tags: ['alpha'],
    }),
  ];
}

function createFilteringItems(): MediaLibraryItem[] {
  return [
    createItem({
      id: 'match-oldest',
      createdAt: 10,
      filename: 'alpha-note.png',
      sourceTitle: 'Alpha note',
      tags: ['alpha'],
    }),
    createItem({
      id: 'match-newest',
      createdAt: 30,
      filename: 'alpha-latest.png',
      sourceTitle: 'Alpha latest',
      tags: ['alpha', 'beta'],
    }),
    createItem({
      id: 'recording',
      kind: 'recording',
      source: { kind: 'recording', recordingId: 'rec-1' },
      createdAt: 20,
      size: 400,
      filename: 'alpha-recording.webm',
      mimeType: 'video/webm',
      width: 1920,
      height: 1080,
      duration: 12,
      tags: ['alpha'],
    }),
  ];
}

function getFilteredIds(args: Parameters<typeof getFilteredGalleryItems>[0]) {
  return getFilteredGalleryItems(args).map((item) => item.id);
}

it('counts gallery items by folder families and returns sorted unique tags', () => {
  const items = createCountAndTagItems();

  expect(getGalleryCounts(items, [])).toEqual({
    all: 6,
    screenshot: 2,
    recording: 2,
    export: 1,
    'web-snapshot': 1,
    scenario: 0,
  });
  expect(getAllGalleryTags(items)).toEqual(['alpha', 'beta', 'delta', 'gamma']);
});

it('does not double-count mixed scenario items in folder totals', () => {
  const items: GalleryItem[] = [
    createItem({ id: 'shot', kind: 'screenshot' }),
    {
      id: 'scenario:project-1',
      entityId: 'project-1',
      filename: 'Project 1',
      createdAt: 2,
      updatedAt: 2,
      hasThumbnail: false,
      kind: 'scenario',
      mimeType: 'application/x-sniptale-scenario',
      project: { id: 'project-1', name: 'Project 1', createdAt: 2, updatedAt: 2 },
      size: 0,
      sourceFavicon: null,
      sourceTitle: null,
      sourceUrl: null,
      tags: ['alpha'],
      width: null,
      height: null,
      duration: null,
      type: 'scenario',
    },
  ];

  expect(getGalleryCounts(items)).toEqual({
    all: 2,
    screenshot: 1,
    recording: 0,
    export: 0,
    'web-snapshot': 0,
    scenario: 1,
  });
});

it('filters tagged items, narrows by folder/search, and sorts by age or size', () => {
  const items = createFilteringItems();

  expect(
    getFilteredIds({
      items,
      activeTags: ['alpha'],
      folderFilter: 'all',
      search: '',
      sortMode: 'newest',
    })
  ).toEqual(['match-newest', 'recording', 'match-oldest']);

  expect(
    getFilteredIds({
      items,
      activeTags: ['alpha'],
      folderFilter: 'screenshot',
      search: 'alpha',
      sortMode: 'oldest',
    })
  ).toEqual(['match-oldest', 'match-newest']);

  expect(
    getFilteredIds({
      items,
      activeTags: ['alpha'],
      folderFilter: 'recording',
      search: 'recording',
      sortMode: 'size',
    })
  ).toEqual(['recording']);
});

it('computes visible grid rows and resolves storage pressure classes', () => {
  const filteredItems = Array.from({ length: 12 }, (_, index) =>
    createItem({ id: `asset-${index}`, createdAt: index + 1 })
  );

  expect(
    getGalleryGridMetrics({
      filteredItems,
      gridWidth: 800,
      scrollTop: 650,
      viewMode: 'compact-grid',
      viewportHeight: 320,
    })
  ).toEqual({
    columnCount: 3,
    startRow: 0,
    totalRows: 4,
    visibleItems: filteredItems,
  });

  expect(getActiveStorageBarClass('critical')).toBe('bg-rose-500');
  expect(getActiveStorageBarClass('warning')).toBe('bg-amber-400');
  expect(getActiveStorageBarClass(undefined)).toBe('bg-emerald-400');
});

it('filters and sorts scenario projects independently from media folders', () => {
  expect(
    getFilteredScenarioProjects({
      projects: [
        { id: 'project-1', name: 'Bravo', createdAt: 1, updatedAt: 20 },
        { id: 'project-2', name: 'Alpha', createdAt: 2, updatedAt: 10 },
      ],
      search: 'a',
      sortMode: 'size',
    }).map((project) => project.id)
  ).toEqual(['project-2', 'project-1']);
});
