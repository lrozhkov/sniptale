import { expect, it } from 'vitest';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import type { GalleryItem } from '../library/items';
import { createScenarioExportItem } from '../library/test-support/items';
import {
  collapseGalleryRecordingGroups,
  getActiveStorageBarClass,
  getAllGalleryTags,
  getFilteredGalleryItems,
  getFilteredScenarioProjects,
  getGalleryCounts,
  getGalleryFacets,
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
    recording: 3,
    export: 1,
    'web-snapshot': 1,
    scenario: 0,
  });
  expect(getAllGalleryTags(items)).toEqual(['alpha', 'beta', 'delta', 'gamma']);
});

it('classifies saved exports by their media family instead of a separate visible category', () => {
  const videoExport = createItem({
    id: 'video-export',
    kind: 'export',
    source: { kind: 'project-export', exportId: 'export-1', projectId: 'project-1' },
  });

  expect(
    getFilteredIds({
      activeTags: [],
      folderFilter: 'recording',
      items: [videoExport],
      search: '',
      sortMode: 'newest',
    })
  ).toEqual(['video-export']);

  const scenarioExport = createScenarioExportItem({ id: 'scenario-export:export-1' });
  expect(
    getFilteredIds({
      activeTags: [],
      folderFilter: 'scenario',
      items: [scenarioExport],
      search: '',
      sortMode: 'newest',
    })
  ).toEqual(['scenario-export:export-1']);
  expect(getGalleryCounts([scenarioExport])).toMatchObject({ scenario: 1 });
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
      sortMode: 'size-desc',
    })
  ).toEqual(['recording']);
});

it('shows saved items and drafts together by default while preserving explicit scope filters', () => {
  const saved = createItem({ id: 'saved' });
  const draft = createItem({
    id: 'draft',
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2 },
  });
  const args = {
    activeTags: [],
    folderFilter: 'all' as const,
    items: [saved, draft],
    search: '',
    sortMode: 'newest' as const,
  };

  expect(getFilteredIds({ ...args, scope: 'all' })).toEqual(['saved', 'draft']);
  expect(getFilteredIds({ ...args, scope: 'library' })).toEqual(['saved']);
  expect(getFilteredIds({ ...args, scope: 'temporary' })).toEqual(['draft']);
});

it('builds non-empty facet clusters and combines OR-within with AND-between filtering', () => {
  const items = [
    createItem({
      id: 'small-png',
      filename: 'small.png',
      size: 50 * 1024,
      sourceUrl: 'https://www.example.com/articles/one',
      tags: ['alpha'],
    }),
    createItem({
      id: 'short-video',
      filename: 'clip.webm',
      kind: 'recording',
      mimeType: 'video/webm',
      size: 2 * 1024 * 1024,
      duration: 90,
      source: { kind: 'recording', recordingId: 'recording-1' },
      sourceUrl: 'https://example.com/videos/two',
      tags: ['beta'],
      width: 1920,
      height: 1080,
    }),
  ];
  const facets = getGalleryFacets(items);

  expect(facets.find((facet) => facet.id === 'source')?.options).toEqual([
    expect.objectContaining({ count: 2, label: 'example.com', value: 'example.com' }),
  ]);
  expect(facets.find((facet) => facet.id === 'size')?.options).toHaveLength(2);
  expect(facets.find((facet) => facet.id === 'duration')?.options).toEqual([
    expect.objectContaining({ count: 1, value: '1-5-minutes' }),
  ]);

  const baseFilters = {
    created: [],
    duration: [],
    format: [],
    resolution: [],
    size: [],
    source: ['example.com'],
    updated: [],
  };
  expect(
    getFilteredIds({
      activeTags: ['alpha', 'beta'],
      facetFilters: baseFilters,
      folderFilter: 'all',
      items,
      search: '',
      scope: 'all',
      sortMode: 'newest',
    })
  ).toEqual(['small-png', 'short-video']);
  expect(
    getFilteredIds({
      activeTags: ['alpha', 'beta'],
      facetFilters: { ...baseFilters, duration: ['1-5-minutes'], format: ['webm'] },
      folderFilter: 'all',
      items,
      search: '',
      scope: 'all',
      sortMode: 'newest',
    })
  ).toEqual(['short-video']);
});

it('builds adaptive creation and modification date facets from represented calendar ranges', () => {
  const now = new Date(2026, 7, 26, 12).getTime();
  const items = [
    createItem({
      id: 'today',
      createdAt: new Date(2026, 7, 26, 9).getTime(),
      updatedAt: new Date(2026, 7, 11, 9).getTime(),
    }),
    createItem({
      id: 'yesterday',
      createdAt: new Date(2026, 7, 25, 9).getTime(),
      updatedAt: new Date(2026, 7, 26, 10).getTime(),
    }),
    createItem({
      id: 'recent',
      createdAt: new Date(2026, 7, 22, 9).getTime(),
      updatedAt: new Date(2025, 11, 10, 9).getTime(),
    }),
  ];

  const facets = getGalleryFacets(items, { now });

  expect(facets.map((facet) => facet.id)).toEqual(expect.arrayContaining(['created', 'updated']));
  expect(facets.find((facet) => facet.id === 'created')?.options).toEqual([
    expect.objectContaining({ count: 1, value: 'today' }),
    expect.objectContaining({ count: 1, value: 'yesterday' }),
    expect.objectContaining({ count: 1, value: 'days-2-7' }),
  ]);
  expect(facets.find((facet) => facet.id === 'updated')?.options).toEqual([
    expect.objectContaining({ count: 1, value: 'today' }),
    expect.objectContaining({ count: 1, value: 'days-8-30' }),
    expect.objectContaining({ count: 1, value: 'older' }),
  ]);

  expect(
    getFilteredIds({
      activeTags: [],
      facetFilters: {
        created: ['days-2-7'],
        duration: [],
        format: [],
        resolution: [],
        size: [],
        source: [],
        updated: ['older'],
      },
      folderFilter: 'all',
      items,
      now,
      search: '',
      scope: 'all',
      sortMode: 'newest',
    })
  ).toEqual(['recent']);
});

it('uses honest long-edge resolution ranges and keeps source options to real domains', () => {
  const items = [
    createItem({
      id: 'wide-recording',
      filename: 'wide.webm',
      kind: 'recording',
      mimeType: 'video/webm',
      source: { kind: 'recording', recordingId: 'recording-1' },
      sourceUrl: 'https://www.example.com/capture',
      width: 2560,
      height: 1305,
    }),
    createItem({
      id: 'local-recording',
      filename: 'local.webm',
      kind: 'recording',
      mimeType: 'video/webm',
      source: { kind: 'recording', recordingId: 'recording-2' },
      sourceUrl: null,
      width: 1920,
      height: 1080,
    }),
  ];
  const facets = getGalleryFacets(items);

  expect(facets.find((facet) => facet.id === 'resolution')?.options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ value: 'full-hd' }),
      expect.objectContaining({ value: 'qhd' }),
    ])
  );
  expect(facets.find((facet) => facet.id === 'source')?.options).toEqual([
    expect.objectContaining({ label: 'example.com', value: 'example.com' }),
  ]);
});

it('rebuilds facet values for the selected category and status without hiding other statuses', () => {
  const savedShot = createItem({
    id: 'saved-shot',
    sourceUrl: 'https://shots.example/image',
    tags: ['shot'],
  });
  const draftRecording = createItem({
    id: 'draft-recording',
    kind: 'recording',
    mimeType: 'video/webm',
    source: { kind: 'recording', recordingId: 'recording-1' },
    sourceUrl: 'https://video.example/capture',
    tags: ['video'],
    duration: 15,
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2 },
  });

  const screenshotFacets = getGalleryFacets([savedShot, draftRecording], {
    folderFilter: 'screenshot',
    scope: 'library',
  });
  expect(screenshotFacets.find((facet) => facet.id === 'tags')?.options).toEqual([
    expect.objectContaining({ value: 'shot' }),
  ]);
  expect(screenshotFacets.find((facet) => facet.id === 'duration')?.options).toEqual([]);
  expect(screenshotFacets.find((facet) => facet.id === 'source')?.options).toEqual([
    expect.objectContaining({ value: 'shots.example' }),
  ]);
  expect(screenshotFacets.find((facet) => facet.id === 'status')?.options).toEqual([
    expect.objectContaining({ count: 1, value: 'library' }),
    expect.objectContaining({ count: 0, value: 'temporary' }),
  ]);
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

it('projects one grid card per recording group without hiding list rows', () => {
  const display = createItem({
    id: 'recording:display',
    kind: 'recording',
    recordingGroup: { groupId: 'capture-1', order: 0, role: 'display', sourceLabel: 'Window' },
  });
  const webcam = createItem({
    id: 'recording:webcam',
    kind: 'recording',
    recordingGroup: { groupId: 'capture-1', order: 1, role: 'webcam', sourceLabel: null },
  });
  const items = [display, webcam, createItem({ id: 'standalone' })].map((item) =>
    item.recordingGroup
      ? {
          ...item,
          type: 'media' as const,
          recordingGroupView: {
            ...item.recordingGroup,
            memberCount: 2,
            projectId: 'project-1',
          },
        }
      : { ...item, type: 'media' as const }
  );

  expect(collapseGalleryRecordingGroups(items).map((item) => item.id)).toEqual([
    'recording:display',
    'standalone',
  ]);
  expect(
    getGalleryGridMetrics({
      filteredItems: items,
      gridWidth: 800,
      scrollTop: 0,
      viewMode: 'compact-grid',
      viewportHeight: 320,
    })
  ).toMatchObject({ totalRows: 1, visibleItems: [items[0], items[2]] });
  expect(
    getGalleryGridMetrics({
      filteredItems: items,
      gridWidth: 800,
      scrollTop: 0,
      viewMode: 'list',
      viewportHeight: 320,
    }).visibleItems
  ).toEqual(items);
});

it('filters and sorts scenario projects independently from media folders', () => {
  expect(
    getFilteredScenarioProjects({
      projects: [
        { id: 'project-1', name: 'Bravo', createdAt: 1, updatedAt: 20 },
        { id: 'project-2', name: 'Alpha', createdAt: 2, updatedAt: 10 },
      ],
      search: 'a',
      sortMode: 'name-asc',
    }).map((project) => project.id)
  ).toEqual(['project-2', 'project-1']);
});
