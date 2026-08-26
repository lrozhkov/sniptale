import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import {
  createGallerySavedView,
  deleteGallerySavedView,
  listGallerySavedViews,
  moveGallerySavedView,
  updateGallerySavedView,
  type GallerySavedView,
  type GallerySavedViewFilterSnapshot,
  type GallerySavedViewFolder,
} from '../../composition/persistence/gallery-saved-views';
import type { GalleryFilterPreferences } from './filter-preferences';
import type { GalleryFacetFilters } from './types';

const EMPTY_FACET_FILTERS: GalleryFacetFilters = {
  created: [],
  duration: [],
  format: [],
  resolution: [],
  size: [],
  source: [],
  updated: [],
};

function filterSnapshotKey(snapshot: GallerySavedViewFilterSnapshot): string {
  const sorted = (values: readonly string[]) =>
    [...values].sort((left, right) => left.localeCompare(right));
  return JSON.stringify({
    activeTags: sorted(snapshot.activeTags),
    facetFilters: Object.fromEntries(
      Object.entries(snapshot.facetFilters).map(([id, values]) => [id, sorted(values)])
    ),
    scope: snapshot.scope,
  });
}

async function reloadGallerySavedViewState(args: {
  applySavedView: (view: GallerySavedView) => void;
  clearActiveSavedView: () => void;
  getActiveSavedViewId: () => string | null;
  setLoadFailed: (failed: boolean) => void;
  setLoaded: (loaded: boolean) => void;
  setViews: (views: GallerySavedView[]) => void;
}): Promise<void> {
  try {
    const views = await listGallerySavedViews();
    args.setViews(views);
    args.setLoaded(true);
    args.setLoadFailed(false);
    const activeId = args.getActiveSavedViewId();
    if (!activeId) return;
    const activeView = views.find((view) => view.id === activeId);
    if (activeView) args.applySavedView(activeView);
    else args.clearActiveSavedView();
  } catch (error) {
    args.setLoadFailed(true);
    args.setLoaded(true);
    throw error;
  }
}

function useLoadedGallerySavedViews(args: {
  filterPreferencesRef: MutableRefObject<GalleryFilterPreferences>;
  updateFilterPreferences: (
    update: (value: GalleryFilterPreferences) => GalleryFilterPreferences
  ) => void;
}) {
  const { filterPreferencesRef, updateFilterPreferences } = args;
  const [views, setViews] = useState<GallerySavedView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void listGallerySavedViews()
      .then((loadedViews) => {
        if (!active) return;
        setViews(loadedViews);
        setLoaded(true);
        const activeId = filterPreferencesRef.current.activeSavedViewId;
        if (activeId && !loadedViews.some((view) => view.id === activeId)) {
          updateFilterPreferences((current) => ({ ...current, activeSavedViewId: null }));
        }
      })
      .catch(() => {
        if (active) {
          setLoadFailed(true);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [filterPreferencesRef, updateFilterPreferences]);
  return { loadFailed, loaded, setLoadFailed, setLoaded, setViews, views };
}

export function useGallerySavedViewState(args: {
  filterPreferences: GalleryFilterPreferences;
  filterPreferencesRef: MutableRefObject<GalleryFilterPreferences>;
  updateFilterPreferences: (
    update: (value: GalleryFilterPreferences) => GalleryFilterPreferences
  ) => void;
}) {
  const { filterPreferencesRef, updateFilterPreferences } = args;
  const savedViewCollection = useLoadedGallerySavedViews({
    filterPreferencesRef,
    updateFilterPreferences,
  });
  const savedViews = savedViewCollection.views;

  const currentSnapshot = useMemo<GallerySavedViewFilterSnapshot>(
    () => ({
      activeTags: args.filterPreferences.activeTags,
      facetFilters: args.filterPreferences.facetFilters,
      scope: args.filterPreferences.scope,
    }),
    [
      args.filterPreferences.activeTags,
      args.filterPreferences.facetFilters,
      args.filterPreferences.scope,
    ]
  );
  const activeSavedView =
    savedViews.find((view) => view.id === args.filterPreferences.activeSavedViewId) ?? null;
  const isSavedViewDirty = Boolean(
    activeSavedView &&
    filterSnapshotKey(activeSavedView.filters) !== filterSnapshotKey(currentSnapshot)
  );

  const applySavedView = (view: GallerySavedView) => {
    args.updateFilterPreferences(() => ({
      activeSavedViewId: view.id,
      activeTags: [...view.filters.activeTags],
      facetFilters: structuredClone(view.filters.facetFilters),
      folderFilter: view.folderFilter,
      scope: view.filters.scope,
    }));
  };

  return {
    actions: {
      createSavedView: async (name: string) => {
        const folder = args.filterPreferencesRef.current.folderFilter;
        if (folder === 'export') throw new Error('This Gallery category cannot own saved views.');
        const view = await createGallerySavedView({
          filters: {
            activeTags: args.filterPreferencesRef.current.activeTags,
            facetFilters: args.filterPreferencesRef.current.facetFilters,
            scope: args.filterPreferencesRef.current.scope,
          },
          folderFilter: folder as GallerySavedViewFolder,
          name,
        });
        savedViewCollection.setViews((current) => [...current, view]);
        applySavedView(view);
        return view;
      },
      deleteSavedView: async (id: string) => {
        const deleted = savedViews.find((view) => view.id === id);
        await deleteGallerySavedView(id);
        savedViewCollection.setViews((current) => current.filter((view) => view.id !== id));
        if (args.filterPreferencesRef.current.activeSavedViewId === id) {
          args.updateFilterPreferences((current) => ({
            ...current,
            activeSavedViewId: null,
            activeTags: [],
            facetFilters: EMPTY_FACET_FILTERS,
            folderFilter: deleted?.folderFilter ?? current.folderFilter,
            scope: 'all',
          }));
        }
      },
      moveSavedView: async (id: string, direction: 'down' | 'up') => {
        const reordered = await moveGallerySavedView(id, direction);
        savedViewCollection.setViews(reordered);
      },
      reloadSavedViews: async () => {
        await reloadGallerySavedViewState({
          applySavedView,
          clearActiveSavedView: () =>
            args.updateFilterPreferences((current) => ({
              ...current,
              activeSavedViewId: null,
            })),
          getActiveSavedViewId: () => args.filterPreferencesRef.current.activeSavedViewId,
          setLoadFailed: savedViewCollection.setLoadFailed,
          setLoaded: savedViewCollection.setLoaded,
          setViews: savedViewCollection.setViews,
        });
      },
      selectSavedView: (id: string) => {
        const view = savedViews.find((candidate) => candidate.id === id);
        if (view) applySavedView(view);
      },
      updateSavedView: async () => {
        const id = args.filterPreferencesRef.current.activeSavedViewId;
        if (!id) throw new Error('No saved Gallery view is selected.');
        const updated = await updateGallerySavedView(id, {
          activeTags: args.filterPreferencesRef.current.activeTags,
          facetFilters: args.filterPreferencesRef.current.facetFilters,
          scope: args.filterPreferencesRef.current.scope,
        });
        savedViewCollection.setViews((current) =>
          current.map((view) => (view.id === updated.id ? updated : view))
        );
      },
    },
    resetToSavedView: () => {
      const view = savedViews.find(
        (candidate) => candidate.id === args.filterPreferencesRef.current.activeSavedViewId
      );
      if (view) applySavedView(view);
      return Boolean(view);
    },
    state: {
      activeSavedView,
      isSavedViewDirty,
      savedViews,
      savedViewsLoadFailed: savedViewCollection.loadFailed,
      savedViewsLoaded: savedViewCollection.loaded,
    },
  };
}
