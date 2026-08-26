// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createController, createMediaItem } from '../../library/actions/test-support/index';
import type { UseGalleryAppActionsResult } from '../../library/actions/useGalleryAppActions.types';
import type { GalleryViewMode } from '../../state/types';
import { createLocalBackupSummary } from './backup-export.test-support';

const { layoutPropsMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  layoutPropsMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('./layout', () => ({
  GalleryAppLayout: (props: unknown) => {
    layoutPropsMock(props);
    return <div data-ui="test.layout" />;
  },
}));

import { GalleryAppBindings } from './bindings';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type TestLayoutProps = {
  onAddTag: (tag?: string) => void;
  onApplySelectionTag: (tag?: string) => void;
  onBackupExportConfirm: (options: unknown) => void;
  onBackupExportInspect: (options: unknown) => Promise<unknown>;
  onBannerDismiss: () => void;
  onClearSelection: () => void;
  onConfirmDialogClose: () => void;
  onDeleteMany: (items: unknown[]) => void;
  onExportBackup: () => void;
  onImport: (strategy: unknown) => void;
  onImportBackupClick: () => void;
  onImportFileChange: (file: File | null) => void;
  onMediaImportFileChange: (files: File[]) => void;
  onImportMediaClick: () => void;
  onPendingExportClose: () => void;
  onPendingImportClose: () => void;
  onPendingMediaImportClose: () => void;
  onMediaImportConfirm: (strategy: 'skip' | 'duplicate') => void;
  onPreviewClose: () => void;
  onPreviewInspectorToggle: () => void;
  onPreviewDelete: (item: unknown) => void;
  onPreviewOpenSnapshotScreenshot: () => void;
  onPreviewOpen: (item: unknown, options?: { inspectorCollapsed?: boolean }) => void;
  onPreviewNavigate: (item: unknown) => void;
  onPreviewPromote: (item: unknown) => Promise<void>;
  onPreviewResetChanges: () => void;
  onRemoveTag: (tag: string) => void;
  onResetFilters: () => void;
  onSelectAllFiltered: () => void;
  onSelectionBackup: () => void;
  onSelectionZip: () => void;
  onViewModeChange: (mode: string) => void;
  viewMode: string;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function createActions(): UseGalleryAppActionsResult {
  return {
    backup: {
      closePendingExport: vi.fn(),
      confirmExport: vi.fn(async () => undefined),
      exportBackup: vi.fn(async () => undefined),
      inspectExport: vi.fn(async () => createLocalBackupSummary()),
    },
    importing: {
      cancelActiveImport: vi.fn(),
      closePendingImport: vi.fn(),
      closePendingMediaImport: vi.fn(),
      confirmMediaFileImport: vi.fn(async () => undefined),
      dismissActiveImport: vi.fn(),
      importBackup: vi.fn(async () => undefined),
      importSelectedFile: vi.fn(async () => undefined),
      importMediaFiles: vi.fn(async () => undefined),
    },
    preview: {
      close: vi.fn(async () => undefined),
      copy: vi.fn(),
      download: vi.fn(),
      downloadOriginal: vi.fn(),
      navigate: vi.fn(async () => undefined),
      openInEditor: vi.fn(),
      openSnapshotScreenshotInEditor: vi.fn(),
      resetChanges: vi.fn(),
      restoreOriginal: vi.fn(),
      saveCopy: vi.fn(),
      saveMetadata: vi.fn(async () => undefined),
    },
    selection: {
      applyTag: vi.fn(async () => undefined),
      deleteMany: vi.fn(),
      downloadBackup: vi.fn(async () => undefined),
      downloadZip: vi.fn(async () => undefined),
    },
  };
}

function createControllerState() {
  const selectableItem = createMediaItem({ id: 'asset-1' });
  const state = createController({
    filteredItems: [selectableItem],
    previewItem: selectableItem,
    previewInspectorCollapsed: false,
    tagDraft: 'beta',
    tagDrafts: ['alpha'],
  });
  const importInputRef = state.controller.refs.importInputRef as {
    current: { click: ReturnType<typeof vi.fn> } | null;
  };
  importInputRef.current = { click: vi.fn() };
  const mediaImportInputRef = state.controller.refs.mediaImportInputRef as {
    current: { click: ReturnType<typeof vi.fn> } | null;
  };
  mediaImportInputRef.current = { click: vi.fn() };

  return { ...state, importInputRef, mediaImportInputRef };
}

function renderBindings() {
  const controllerState = createControllerState();
  const actions = createActions();
  let viewMode: GalleryViewMode = 'compact-grid';
  const setViewMode = vi.fn(
    (next: GalleryViewMode | ((previous: GalleryViewMode) => GalleryViewMode)) => {
      viewMode = typeof next === 'function' ? next(viewMode) : next;
    }
  );
  act(() => {
    root?.render(
      <GalleryAppBindings
        actions={actions}
        controller={controllerState.controller}
        messaging={{ sendRuntimeMessage: sendRuntimeMessageMock }}
        setViewMode={setViewMode}
        viewMode={viewMode}
      />
    );
  });

  return {
    actions,
    ...controllerState,
    importInputRef: controllerState.importInputRef,
    layoutProps: layoutPropsMock.mock.lastCall?.[0] as TestLayoutProps,
    readViewMode: () => viewMode,
  };
}

it('maps gallery actions into layout props and handles primary callbacks', () => {
  const { actions, getState, importInputRef, layoutProps, mediaImportInputRef, readViewMode } =
    renderBindings();

  act(() => {
    layoutProps.onImportFileChange(null);
    layoutProps.onMediaImportFileChange([]);
    layoutProps.onConfirmDialogClose();
    layoutProps.onPendingExportClose();
    layoutProps.onBackupExportConfirm({ scope: 'all' });
    void layoutProps.onBackupExportInspect({ scope: 'all' });
    layoutProps.onPendingImportClose();
    layoutProps.onPendingMediaImportClose();
    layoutProps.onMediaImportConfirm('skip');
    layoutProps.onImport('replace');
    layoutProps.onPreviewInspectorToggle();
    layoutProps.onPreviewClose();
    layoutProps.onRemoveTag('alpha');
    layoutProps.onResetFilters();
    layoutProps.onPreviewResetChanges();
    layoutProps.onPreviewDelete({ id: 'asset-1' });
    layoutProps.onPreviewOpenSnapshotScreenshot();
    layoutProps.onExportBackup();
    layoutProps.onImportBackupClick();
    layoutProps.onImportMediaClick();
    layoutProps.onBannerDismiss();
    layoutProps.onApplySelectionTag();
    layoutProps.onSelectionBackup();
    layoutProps.onSelectionZip();
    layoutProps.onDeleteMany([{ id: 'asset-2' }]);
    layoutProps.onClearSelection();
    layoutProps.onSelectAllFiltered();
    layoutProps.onPreviewOpen({ id: 'asset-3' }, { inspectorCollapsed: true });
    layoutProps.onViewModeChange('list');
  });

  expect(layoutPropsMock).toHaveBeenCalled();
  expect(actions.preview.close).toHaveBeenCalledTimes(1);
  expect(actions.preview.openSnapshotScreenshotInEditor).toHaveBeenCalledTimes(1);
  expect(actions.preview.resetChanges).toHaveBeenCalledTimes(1);
  expect(actions.backup.closePendingExport).toHaveBeenCalledTimes(1);
  expect(actions.backup.confirmExport).toHaveBeenCalledWith({ scope: 'all' });
  expect(actions.backup.inspectExport).toHaveBeenCalledWith({ scope: 'all' });
  expect(getState().storage.pendingExport).toBeNull();
  expect(getState().preview.session.inspectorCollapsed).toBe(true);
  expect(getState().preview.session.item).toEqual({ id: 'asset-3' });
  expect(readViewMode()).toBe('list');
  expect(importInputRef.current?.click).toHaveBeenCalledTimes(1);
  expect(mediaImportInputRef.current?.click).toHaveBeenCalledTimes(1);
  expect(actions.importing.importMediaFiles).toHaveBeenCalledWith([]);
  expect(actions.importing.closePendingMediaImport).toHaveBeenCalledTimes(1);
  expect(actions.importing.confirmMediaFileImport).toHaveBeenCalledWith('skip');
  expect(actions.selection.downloadBackup).toHaveBeenCalledTimes(1);
  expect(actions.selection.downloadZip).toHaveBeenCalledTimes(1);
  expect(Array.from(getState().selection.selectedIds)).toEqual(['asset-1']);
});

it('deduplicates tags when the add-tag action runs repeatedly', () => {
  const { controller, getState, layoutProps } = renderBindings();

  act(() => {
    layoutProps.onAddTag();
  });

  expect(getState().preview.draft.tags).toEqual(['alpha', 'beta']);

  act(() => {
    controller.actions.preview.setTagDrafts(['beta']);
    controller.actions.preview.setTagDraft('beta');
    layoutProps.onAddTag();
  });

  expect(getState().preview.draft.tags).toEqual(['beta']);
});

it('adds the exact tag chosen from the suggestion list', () => {
  const { getState, layoutProps } = renderBindings();

  act(() => {
    layoutProps.onAddTag('suggested-tag');
  });

  expect(getState().preview.draft.tags).toContain('suggested-tag');
});

it('reuses the last inspector position when opening another preview item', () => {
  const { getState, layoutProps } = renderBindings();

  act(() => {
    layoutProps.onPreviewInspectorToggle();
    layoutProps.onPreviewOpen(createMediaItem({ id: 'asset-next' }));
  });

  expect(getState().preview.session.item?.id).toBe('asset-next');
  expect(getState().preview.session.inspectorCollapsed).toBe(true);
});

it('persists metadata before navigating to an adjacent preview item', async () => {
  const { actions, layoutProps } = renderBindings();
  const nextItem = createMediaItem({ id: 'asset-next' });

  await act(async () => {
    layoutProps.onPreviewNavigate(nextItem);
    await Promise.resolve();
  });

  expect(actions.preview.navigate).toHaveBeenCalledWith(nextItem);
});

it('promotes each supported gallery owner and refreshes the active scope', async () => {
  const { controller, layoutProps } = renderBindings();
  sendRuntimeMessageMock.mockResolvedValue({ result: 'promoted', success: true });
  const items = [
    createMediaItem({ id: 'media-1' }),
    { entityId: 'scenario-1', id: 'scenario:scenario-1', type: 'scenario' },
    { entityId: 'video-1', id: 'video-project:video-1', type: 'video-project' },
    {
      entityId: 'export-1',
      id: 'scenario-export:export-1',
      project: { id: 'scenario-2' },
      type: 'scenario-export',
    },
  ];

  for (const item of items) {
    await act(async () => layoutProps.onPreviewPromote(item));
  }

  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
    aggregate: { id: 'media-1', kind: 'image' },
    type: 'PROMOTE_AGGREGATE_TO_LIBRARY',
  });
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
    aggregate: { id: 'scenario-1', kind: 'scenario' },
    type: 'PROMOTE_AGGREGATE_TO_LIBRARY',
  });
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(3, {
    aggregate: { id: 'video-1', kind: 'video-project' },
    type: 'PROMOTE_AGGREGATE_TO_LIBRARY',
  });
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(4, {
    aggregate: { id: 'scenario-2', kind: 'scenario' },
    type: 'PROMOTE_AGGREGATE_TO_LIBRARY',
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(4);
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(4);
});
