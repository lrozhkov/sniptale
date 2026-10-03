import { expect, it } from 'vitest';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import { formatDateTime } from '@sniptale/platform/i18n/format';
import type { GalleryItem } from '../library/items';
import { createGalleryDateFormatter, formatDate } from '../library/ui/date';
import {
  createScenarioExportItem,
  createScenarioItem,
  createVideoProjectItem,
} from '../library/test-support/items';
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

it('sorts recently modified items by update time, falls back to creation, and breaks ties by id', () => {
  const items: GalleryItem[] = [
    createItem({ id: 'new-created', createdAt: 100, updatedAt: 100 }),
    createItem({ id: 'old-edited', createdAt: 1, updatedAt: 200 }),
    createItem({ id: 'tie-b', updatedAt: 50 }),
    createItem({ id: 'tie-a', updatedAt: 50 }),
    createItem({ id: 'fallback', createdAt: 40, updatedAt: Number.NaN }),
    createItem({ id: 'unknown', createdAt: Number.NaN, updatedAt: Number.NaN }),
    createScenarioItem({ id: 'scenario', createdAt: 2, updatedAt: 300 }),
    createVideoProjectItem({ id: 'video-project', createdAt: 3, updatedAt: 250 }),
  ];
  const args = {
    activeTags: [],
    folderFilter: 'all' as const,
    items,
    search: '',
    scope: 'all' as const,
  };
  expect(getFilteredIds({ ...args, sortMode: 'recently-modified' })).toEqual([
    'scenario',
    'video-project',
    'old-edited',
    'new-created',
    'tie-a',
    'tie-b',
    'fallback',
    'unknown',
  ]);
  expect(getFilteredIds({ ...args, items: items.slice(0, 2), sortMode: 'newest' })).toEqual([
    'new-created',
    'old-edited',
  ]);
  expect(
    getFilteredIds({ ...args, items: [...items].reverse(), sortMode: 'recently-modified' })
  ).toEqual(getFilteredIds({ ...args, sortMode: 'recently-modified' }));
});

it('keeps recently modified sorting after filtering and reorders edited media on refresh', () => {
  const items = [
    createItem({ id: 'one', filename: 'capture one.png', tags: ['work'], updatedAt: 10 }),
    createItem({ id: 'two', filename: 'capture two.png', tags: ['work'], updatedAt: 20 }),
    createItem({ id: 'other', tags: ['other'], updatedAt: 30 }),
  ];
  const args = {
    activeTags: ['work'],
    folderFilter: 'screenshot' as const,
    search: 'capture',
    sortMode: 'recently-modified' as const,
  };
  expect(getFilteredIds({ ...args, items })).toEqual(['two', 'one']);
  expect(
    getFilteredIds({ ...args, items: [{ ...items[0]!, updatedAt: 40 }, ...items.slice(1)] })
  ).toEqual(['one', 'two']);
});

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
    audio: 0,
    screenshot: 2,
    recording: 3,
    export: 0,
    'video-project': 0,
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
      folderFilter: 'export',
      items: [scenarioExport],
      search: '',
      sortMode: 'newest',
    })
  ).toEqual(['scenario-export:export-1']);
  expect(getGalleryCounts([scenarioExport])).toMatchObject({ scenario: 0, export: 1 });
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
      project: {
        availability: 'available' as const,
        id: 'project-1',
        name: 'Project 1',
        createdAt: 2,
        updatedAt: 2,
      },
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
    audio: 0,
    screenshot: 1,
    recording: 0,
    export: 0,
    'video-project': 0,
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

it('matches both displayed dates after text fields miss', () => {
  const createdAt = Date.UTC(2025, 0, 2, 10, 15);
  const updatedAt = Date.UTC(2025, 7, 19, 16, 45);
  const item = createItem({ id: 'dated', createdAt, updatedAt });
  const galleryArgs = {
    activeTags: [],
    folderFilter: 'all' as const,
    items: [item],
    sortMode: 'newest' as const,
  };
  const project = {
    availability: 'available' as const,
    id: 'dated-project',
    name: 'Untitled',
    createdAt,
    updatedAt,
  };

  for (const timestamp of [createdAt, updatedAt]) {
    const search = formatDate(timestamp).toUpperCase();
    expect(getFilteredIds({ ...galleryArgs, search })).toEqual(['dated']);
    expect(
      getFilteredScenarioProjects({ projects: [project], search, sortMode: 'newest' }).map(
        (result) => result.id
      )
    ).toEqual(['dated-project']);
  }

  expect(getFilteredIds({ ...galleryArgs, search: 'no matching field or date' })).toEqual([]);
});

it.each(['en', 'ru'] as const)(
  'reuses the exact Gallery date formatting for %s searches',
  (locale) => {
    const timestamp = Date.UTC(2025, 7, 19, 16, 45);
    const expected = formatDateTime(
      timestamp,
      { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
      locale
    );
    expect(createGalleryDateFormatter(locale).format(timestamp)).toBe(expected);
    expect(() => createGalleryDateFormatter(locale).format(Number.NaN)).toThrow(RangeError);
  }
);

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

  const recordingFacets = getGalleryFacets([savedShot, draftRecording], {
    facetFilters: {
      created: [],
      duration: [],
      format: [],
      resolution: [],
      size: [],
      source: ['shots.example'],
      updated: [],
    },
    folderFilter: 'recording',
    scope: 'all',
  });
  expect(recordingFacets.find((facet) => facet.id === 'source')?.options).toEqual([
    expect.objectContaining({ count: 0, label: 'shots.example', value: 'shots.example' }),
    expect.objectContaining({ count: 1, label: 'video.example', value: 'video.example' }),
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
    rowTops: [0, 202, 404, 606, 808],
    startRow: 0,
    totalRows: 4,
    visibleItems: filteredItems,
  });

  expect(getActiveStorageBarClass('critical')).toBe('bg-rose-500');
  expect(getActiveStorageBarClass('warning')).toBe('bg-amber-400');
  expect(getActiveStorageBarClass(undefined)).toBe('bg-emerald-400');
});

it('keeps equal-height project and ordinary rows visible and clamps stale scroll', () => {
  const project = createVideoProjectItem();
  const ordinary = Array.from({ length: 18 }, (_, index) => createItem({ id: `asset-${index}` }));
  const items = [project, ...ordinary];
  const middle = getGalleryGridMetrics({
    filteredItems: items,
    gridWidth: 800,
    scrollTop: 1_050,
    viewMode: 'compact-grid',
    viewportHeight: 200,
  });
  expect(middle.rowTops[1]).toBe(middle.rowTops[2]! - middle.rowTops[1]!);
  expect(middle.startRow).toBeGreaterThan(0);
  expect(middle.visibleItems).toContain(ordinary[14]);

  const end = getGalleryGridMetrics({
    filteredItems: items,
    gridWidth: 800,
    scrollTop: 100_000,
    viewMode: 'compact-grid',
    viewportHeight: 200,
  });
  expect(end.visibleItems).toContain(ordinary[ordinary.length - 1]);
  expect(end.rowTops).toHaveLength(end.totalRows + 1);
  expect(
    getGalleryGridMetrics({
      filteredItems: [],
      gridWidth: 800,
      scrollTop: 100_000,
      viewMode: 'compact-grid',
      viewportHeight: 200,
    }).visibleItems
  ).toEqual([]);
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
        {
          availability: 'available' as const,
          id: 'project-1',
          name: 'Bravo',
          createdAt: 1,
          updatedAt: 20,
        },
        {
          availability: 'available' as const,
          id: 'project-2',
          name: 'Alpha',
          createdAt: 2,
          updatedAt: 10,
        },
      ],
      search: 'a',
      sortMode: 'name-asc',
    }).map((project) => project.id)
  ).toEqual(['project-2', 'project-1']);
});

it('counts audio separately and filters out images and videos from Audio', () => {
  const audio = createItem({
    id: 'audio',
    kind: 'audio',
    source: { kind: 'project-asset', projectAssetId: 'audio' },
  });
  const items = [...createCountAndTagItems(), audio];
  expect(getGalleryCounts(items)).toMatchObject({ all: 7, audio: 1, recording: 3, screenshot: 2 });
  expect(
    getFilteredIds({ activeTags: [], folderFilter: 'audio', items, search: '', sortMode: 'newest' })
  ).toEqual(['audio']);
});

it('keeps project folders disjoint from ready materials and counts the same results', () => {
  const video = createVideoProjectItem();
  const scenario = createScenarioItem();
  const exported = createScenarioExportItem();
  const recording = createItem({ id: 'recording', kind: 'recording' });
  const items = [video, scenario, exported, recording];
  for (const [folderFilter, expected] of [
    ['video-project', [video.id]],
    ['scenario', [scenario.id]],
    ['export', [exported.id]],
    ['recording', [recording.id]],
    ['all', items.map((item) => item.id)],
  ] as const) {
    const filtered = getFilteredGalleryItems({
      items,
      folderFilter,
      activeTags: [],
      search: '',
      sortMode: 'newest',
    });
    expect(filtered.map((item) => item.id).sort()).toEqual([...expected].sort());
    expect(getGalleryCounts(items)[folderFilter]).toBe(expected.length);
  }
});

it('builds File Type only from real files and filters independently of legacy project titles', () => {
  const items = [
    createScenarioItem({ filename: 'Guide.2026.09.30' }),
    createVideoProjectItem({ filename: 'Recording.project.pdf' }),
    createScenarioExportItem({ filename: 'actual-export.pdf', format: 'pdf' }),
    createItem({ filename: 'image.png', mimeType: 'image/png' }),
  ];
  const format = getGalleryFacets(items).find((facet) => facet.id === 'format')!;
  expect(format.options.map((option) => option.value)).toEqual(['pdf', 'png']);
  const filters = {
    created: [],
    updated: [],
    format: ['pdf'],
    size: [],
    resolution: [],
    duration: [],
    source: [],
  };
  expect(
    getFilteredGalleryItems({
      items,
      folderFilter: 'all',
      activeTags: [],
      search: '',
      sortMode: 'newest',
      facetFilters: filters,
    }).map((item) => item.id)
  ).toEqual([items[2]!.id]);
});

it('bounds list rendering by the viewport while keeping offscreen geometry for keyboard navigation', () => {
  const items = Array.from({ length: 2000 }, (_, index) => createItem({ id: `list-${index}` }));
  const metrics = getGalleryGridMetrics({
    filteredItems: items,
    gridWidth: 3840,
    scrollTop: 9400,
    viewMode: 'list',
    viewportHeight: 2000,
  });
  expect(metrics.visibleItems.length).toBeLessThan(35);
  expect(metrics.startRow).toBeGreaterThan(90);
  expect(metrics.rowTops).toHaveLength(2001);
});
