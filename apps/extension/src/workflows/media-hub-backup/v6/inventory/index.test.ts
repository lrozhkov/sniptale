import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildEffects: vi.fn(),
  buildMedia: vi.fn(),
  buildScenarios: vi.fn(),
  buildVideoProjects: vi.fn(),
  db: { getAll: vi.fn(), transaction: vi.fn() },
  listGalleryViews: vi.fn(),
}));

vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: vi.fn(async () => mocks.db),
}));
vi.mock('./effect-bundles', () => ({ buildEffectBundleRootInventory: mocks.buildEffects }));
vi.mock('./media', () => ({ buildMediaRootInventory: mocks.buildMedia }));
vi.mock('./scenario-projects', () => ({
  buildScenarioProjectRootInventory: mocks.buildScenarios,
}));
vi.mock('./video-projects', () => ({
  buildVideoProjectRootInventory: mocks.buildVideoProjects,
}));
vi.mock('../../../../composition/persistence/gallery-saved-views', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/gallery-saved-views')
  >()),
  listGallerySavedViews: mocks.listGalleryViews,
}));

import {
  MEDIA_LIBRARY_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  VIDEO_EFFECT_BUNDLES_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { createVideoProjectEntry } from '../../../../composition/persistence/projects/index.test-support';
import { createMediaHubBackupExportOptions } from '../options';
import {
  buildMediaHubBackupExportPlanFromLibraryV6,
  prepareMediaHubBackupRootsFromLibraryV6,
} from './index';

function options() {
  return createMediaHubBackupExportOptions({
    includeDrafts: false,
    scope: 'selected',
    selected: {
      mediaAssetIds: [],
      scenarioProjectIds: [],
      videoProjectIds: ['project-1'],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.transaction.mockImplementation(() => ({
    objectStore: (name: string) => ({ getAll: () => mocks.db.getAll(name) }),
    done: Promise.resolve(),
  }));
  mocks.buildEffects.mockResolvedValue([]);
  mocks.buildMedia.mockResolvedValue([]);
  mocks.buildScenarios.mockResolvedValue([]);
  mocks.buildVideoProjects.mockResolvedValue([]);
  mocks.listGalleryViews.mockResolvedValue([]);
});

describe('media backup v6 dependency admission', () => {
  it('does not inspect unrelated effect bundles for an image-only selection', async () => {
    mocks.db.getAll.mockResolvedValue([]);
    mocks.buildEffects.mockRejectedValue(new Error('Unrelated effect bundle is invalid'));

    await expect(
      buildMediaHubBackupExportPlanFromLibraryV6(
        createMediaHubBackupExportOptions({
          scope: 'selected',
          selected: {
            mediaAssetIds: ['image-one'],
            scenarioProjectIds: [],
            videoProjectIds: [],
          },
        })
      )
    ).resolves.toMatchObject({ roots: [] });
    expect(mocks.buildEffects).not.toHaveBeenCalled();
  });

  it('includes saved Gallery views only in a full-library backup', async () => {
    const view = {
      availability: 'available' as const,
      createdAt: 1,
      filters: {
        activeTags: [],
        facetFilters: {
          created: [],
          duration: [],
          format: ['png'],
          resolution: [],
          size: [],
          source: [],
          updated: [],
        },
        scope: 'all' as const,
      },
      folderFilter: 'screenshot' as const,
      id: 'view-1',
      name: 'PNG',
      updatedAt: 1,
    };
    mocks.listGalleryViews.mockResolvedValue([view]);
    mocks.db.getAll.mockResolvedValue([]);

    const full = await buildMediaHubBackupExportPlanFromLibraryV6(
      createMediaHubBackupExportOptions({ scope: 'all' })
    );
    const selected = await buildMediaHubBackupExportPlanFromLibraryV6(options());

    expect(full.manifest.galleryViews).toEqual([view]);
    expect(selected.manifest.galleryViews).toBeUndefined();
    expect(mocks.listGalleryViews).toHaveBeenCalledOnce();
  });

  it('does not export dependencies of a selected draft project after draft opt-out', async () => {
    const project = createVideoProjectEntry(
      { baseRecordingId: 'recording-1' },
      { lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 } }
    );
    mocks.db.getAll.mockImplementation(async (store: string) => {
      if (store === VIDEO_PROJECTS_STORE) return [project];
      if (
        store === MEDIA_LIBRARY_STORE ||
        store === SCENARIO_ASSETS_STORE ||
        store === SCENARIO_PROJECTS_STORE ||
        store === VIDEO_EFFECT_BUNDLES_STORE
      )
        return [];
      return [];
    });

    await buildMediaHubBackupExportPlanFromLibraryV6(options());

    expect(mocks.buildMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          includeDrafts: false,
          selected: expect.objectContaining({ mediaAssetIds: [] }),
        }),
      })
    );
  });

  it('fails rather than silently exporting an excluded draft dependency of an admitted project', async () => {
    const project = createVideoProjectEntry({ baseRecordingId: 'recording-1' });
    mocks.db.getAll.mockImplementation(async (store: string) =>
      store === VIDEO_PROJECTS_STORE ? [project] : []
    );
    await expect(buildMediaHubBackupExportPlanFromLibraryV6(options())).rejects.toThrow(
      'requires an excluded draft media item'
    );
  });
});

it.each(['mediaAssetIds', 'scenarioProjectIds', 'videoProjectIds'] as const)(
  'refuses an absent explicit %s target instead of writing an empty shortcut archive',
  async (kind) => {
    mocks.db.getAll.mockResolvedValue([]);
    const selected = {
      mediaAssetIds: [],
      scenarioProjectIds: [],
      videoProjectIds: [],
      [kind]: ['missing'],
    };
    await expect(
      buildMediaHubBackupExportPlanFromLibraryV6(
        createMediaHubBackupExportOptions({ scope: 'selected', selected }),
        { requireSelected: true }
      )
    ).rejects.toThrow('selected backup item');
  }
);

describe('frozen descriptor-only asset inventory', () => {
  it('creates a canonical descriptor from the exact frozen ref without a body placeholder', async () => {
    const { createObjectCollector } = await import('./helpers');
    const { createArchivePathAllocator } = await import('../../../../composition/archive-transfer');
    const ref = {
      assetId: 'unloaded',
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: 'objects/unloaded' },
      mimeType: 'image/png',
      sha256: 'a'.repeat(64),
      size: 4,
    };
    const onObject = vi.fn();
    const collector = createObjectCollector('frozen', createArchivePathAllocator(), {
      refs: new Map([[ref.assetId, ref]]),
      onObject,
    });
    const db = { get: vi.fn(async () => ref) };
    const objectId = await collector.addAsset(db, ref.assetId, 'original.png', 'image/png');
    expect(collector.objects).toEqual([]);
    expect(collector.references).toEqual([
      {
        ref: expect.objectContaining({
          objectId,
          size: 4,
          filename: 'original.png',
          mimeType: 'image/png',
        }),
      },
    ]);
    expect(onObject).toHaveBeenCalledExactlyOnceWith(ref.assetId, collector.references[0]!.ref);
    expect(await collector.addAsset(db, ref.assetId, 'another-role.png', 'image/png')).toBe(
      objectId
    );
    expect(collector.references).toHaveLength(1);
    expect(onObject).toHaveBeenCalledTimes(1);
  });

  it('refuses a changed frozen reference before allocating its descriptor', async () => {
    const { createObjectCollector } = await import('./helpers');
    const { createArchivePathAllocator } = await import('../../../../composition/archive-transfer');
    const ref = {
      assetId: 'unloaded',
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: 'objects/unloaded' },
      mimeType: 'image/png',
      sha256: 'a'.repeat(64),
      size: 4,
    };
    const onObject = vi.fn();
    const collector = createObjectCollector('frozen', createArchivePathAllocator(), {
      refs: new Map([[ref.assetId, ref]]),
      onObject,
    });
    await expect(
      collector.addAsset(
        { get: async () => ({ ...ref, size: 5 }) },
        ref.assetId,
        'original.png',
        'image/png'
      )
    ).rejects.toThrow();
    expect(collector.references).toEqual([]);
    expect(onObject).not.toHaveBeenCalled();
  });
});

it.each(['all', 'selected'] as const)(
  'prepares canonical native roots with runtime-only Chrome and no local configuration reads: %s',
  async (scope) => {
    vi.stubGlobal('chrome', { runtime: { id: 'offscreen-fixture' } });
    try {
      const { readEffectCatalogPreferences } = await vi.importActual<
        typeof import('../../../../composition/persistence/effect-bundles/preferences')
      >('../../../../composition/persistence/effect-bundles/preferences');
      await expect(readEffectCatalogPreferences()).rejects.toThrow(
        'chrome.storage.local is unavailable'
      );
      const { buildEffectBundleRootInventory } =
        await vi.importActual<typeof import('./effect-bundles')>('./effect-bundles');
      mocks.buildEffects.mockImplementation(buildEffectBundleRootInventory);
      mocks.db.getAll.mockResolvedValue([]);
      const prepareRoot = vi.fn();
      mocks.buildScenarios.mockImplementation(async (args) => {
        await args.prepareRoot({ rootKind: 'scenario-project', rootId: 'native-scenario' });
        return [{ descriptor: { rootId: 'native-scenario' } }];
      });
      await expect(
        prepareMediaHubBackupRootsFromLibraryV6(createMediaHubBackupExportOptions({ scope }), {
          prepareRoot,
        })
      ).resolves.toBeUndefined();
      expect(prepareRoot).toHaveBeenCalledExactlyOnceWith({
        rootKind: 'scenario-project',
        rootId: 'native-scenario',
      });
      expect(mocks.buildEffects).not.toHaveBeenCalled();
      expect(mocks.listGalleryViews).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  }
);
it('full archive creation still refuses unavailable effect preferences instead of inventing an empty settings snapshot', async () => {
  vi.stubGlobal('chrome', { runtime: { id: 'offscreen-fixture' } });
  try {
    mocks.db.getAll.mockResolvedValue([]);
    const { buildEffectBundleRootInventory } =
      await vi.importActual<typeof import('./effect-bundles')>('./effect-bundles');
    mocks.buildEffects.mockImplementation(buildEffectBundleRootInventory);
    await expect(
      buildMediaHubBackupExportPlanFromLibraryV6(
        createMediaHubBackupExportOptions({ scope: 'all' })
      )
    ).rejects.toThrow('chrome.storage.local is unavailable');
  } finally {
    vi.unstubAllGlobals();
  }
});
it.each(['mediaAssetIds', 'scenarioProjectIds', 'videoProjectIds'] as const)(
  'native preparation refuses an absent explicit %s target through canonical selection',
  async (kind) => {
    mocks.db.getAll.mockResolvedValue([]);
    const selected = {
      mediaAssetIds: [],
      scenarioProjectIds: [],
      videoProjectIds: [],
      [kind]: ['missing'],
    };
    await expect(
      prepareMediaHubBackupRootsFromLibraryV6(
        createMediaHubBackupExportOptions({ scope: 'selected', selected }),
        { prepareRoot: vi.fn(), requireSelected: true }
      )
    ).rejects.toThrow('selected backup item');
  }
);
