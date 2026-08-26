import { vi } from 'vitest';
import type { GalleryAppState, GalleryAppStateController } from '../../../state/types';
import { createGalleryState, type GalleryStateOverride } from './state';

function isStateUpdater<T>(value: T | ((previous: T) => T)): value is (previous: T) => T {
  return typeof value === 'function';
}

function createStateSetter<T>(read: () => T, write: (next: T) => void) {
  return (value: T | ((previous: T) => T)) => {
    write(isStateUpdater(value) ? value(read()) : value);
  };
}

function createGalleryStateRef(overrides: GalleryStateOverride) {
  let state = createGalleryState(overrides);

  return {
    updateState: (nextState: GalleryAppState) => {
      state = nextState;
    },
    getState: () => state,
  };
}

function createNestedSetter<
  Area extends keyof GalleryAppState,
  Key extends keyof GalleryAppState[Area],
>(args: { area: Area; key: Key; stateRef: ReturnType<typeof createGalleryStateRef> }) {
  return createStateSetter(
    () => args.stateRef.getState()[args.area][args.key],
    (value) => {
      const state = args.stateRef.getState();
      args.stateRef.updateState({
        ...state,
        [args.area]: { ...state[args.area], [args.key]: value },
      });
    }
  );
}

function createPreviewSessionSetter(stateRef: ReturnType<typeof createGalleryStateRef>) {
  return createStateSetter(
    () => stateRef.getState().preview.session,
    (value) => {
      const state = stateRef.getState();
      stateRef.updateState({
        ...state,
        preview: { ...state.preview, session: value },
      });
    }
  );
}

function createPreviewDraftSetter<Key extends keyof GalleryAppState['preview']['draft']>(
  stateRef: ReturnType<typeof createGalleryStateRef>,
  key: Key
) {
  return createStateSetter(
    () => stateRef.getState().preview.draft[key],
    (value) => {
      const state = stateRef.getState();
      stateRef.updateState({
        ...state,
        preview: {
          ...state.preview,
          draft: { ...state.preview.draft, [key]: value },
        },
      });
    }
  );
}

function createControllerActions(
  stateRef: ReturnType<typeof createGalleryStateRef>
): GalleryAppStateController['actions'] {
  return {
    filters: {
      resetFilters: () => undefined,
      setActiveTags: () => undefined,
      setFolderFilter: () => undefined,
      setFacetFilter: () => undefined,
      setSearch: () => undefined,
      setScope: () => undefined,
      setSortMode: () => undefined,
    },
    preview: {
      setFilenameDraft: createPreviewDraftSetter(stateRef, 'filename'),
      setPreview: createPreviewSessionSetter(stateRef),
      setTagDraft: createPreviewDraftSetter(stateRef, 'tagInput'),
      setTagDrafts: createPreviewDraftSetter(stateRef, 'tags'),
    },
    selection: {
      setSelectedIds: createNestedSetter({ area: 'selection', key: 'selectedIds', stateRef }),
      setSelectionTagDraft: createNestedSetter({
        area: 'selection',
        key: 'selectionTagDraft',
        stateRef,
      }),
      toggleSelection: () => undefined,
    },
    storage: {
      refresh: vi.fn(async () => undefined),
    },
    surface: {
      setActiveImport: createNestedSetter({ area: 'storage', key: 'activeImport', stateRef }),
      setBanner: () => undefined,
      setConfirmDialog: createNestedSetter({ area: 'storage', key: 'confirmDialog', stateRef }),
      setIsBusy: () => undefined,
      setPendingExport: createNestedSetter({ area: 'storage', key: 'pendingExport', stateRef }),
      setPendingImport: createNestedSetter({ area: 'storage', key: 'pendingImport', stateRef }),
      setPendingMediaImport: createNestedSetter({
        area: 'storage',
        key: 'pendingMediaImport',
        stateRef,
      }),
    },
  };
}

export function createController(overrides: GalleryStateOverride = {}) {
  const stateRef = createGalleryStateRef(overrides);

  const controller: GalleryAppStateController = {
    actions: createControllerActions(stateRef),
    refs: {
      gridViewportRef: { current: null },
      importInputRef: { current: document.createElement('input') },
      importTriggerRef: { current: document.createElement('button') },
      mediaImportInputRef: { current: document.createElement('input') },
      mediaImportTriggerRef: { current: document.createElement('button') },
    },
    get state() {
      return stateRef.getState();
    },
  };

  return {
    controller,
    getConfirmDialog: () => stateRef.getState().storage.confirmDialog,
    getState: stateRef.getState,
  };
}
