// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createController, createMediaItem } from '../../library/actions/test-support/index';
import type { UseGalleryAppActionsResult } from '../../library/actions/useGalleryAppActions.types';
import type { GalleryViewMode } from '../app/types';
import { createLocalBackupSummary } from './backup-export.test-support';

const { layoutPropsMock } = vi.hoisted(() => ({
  layoutPropsMock: vi.fn(),
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
  onAddTag: () => void;
  onApplySelectionTag: () => void;
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
  onPendingExportClose: () => void;
  onPendingImportClose: () => void;
  onPreviewClose: () => void;
  onPreviewInspectorToggle: () => void;
  onPreviewDelete: (item: unknown) => void;
  onPreviewOpenSnapshotScreenshot: () => void;
  onPreviewOpen: (item: unknown, options?: { inspectorCollapsed?: boolean }) => void;
  onPreviewResetChanges: () => void;
  onRefresh: () => void;
  onRemoveTag: (tag: string) => void;
  onSelectionZip: () => void;
  onStorageCleanup: (group: unknown) => void;
  onStorageManagerClose: () => void;
  onStorageManagerOpen: () => void;
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
      importBackup: vi.fn(async () => undefined),
      importSelectedFile: vi.fn(async () => undefined),
    },
    preview: {
      close: vi.fn(async () => undefined),
      copy: vi.fn(),
      download: vi.fn(),
      openInEditor: vi.fn(),
      openSnapshotScreenshotInEditor: vi.fn(),
      resetChanges: vi.fn(),
      saveMetadata: vi.fn(async () => undefined),
    },
    selection: {
      applyTag: vi.fn(async () => undefined),
      deleteMany: vi.fn(),
      downloadZip: vi.fn(async () => undefined),
    },
    storage: {
      cleanup: vi.fn(async () => undefined),
    },
  };
}

function createControllerState() {
  const state = createController({
    previewItem: createMediaItem({ id: 'asset-1' }),
    previewInspectorCollapsed: false,
    tagDraft: 'beta',
    tagDrafts: ['alpha'],
  });
  const importInputRef = state.controller.refs.importInputRef as {
    current: { click: ReturnType<typeof vi.fn> } | null;
  };
  importInputRef.current = { click: vi.fn() };

  return { ...state, importInputRef };
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
  const onRefreshAll = vi.fn();

  act(() => {
    root?.render(
      <GalleryAppBindings
        actions={actions}
        controller={controllerState.controller}
        onRefreshAll={onRefreshAll}
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
    onRefreshAll,
    readViewMode: () => viewMode,
  };
}

it('maps gallery actions into layout props and handles primary callbacks', () => {
  const { actions, getState, importInputRef, layoutProps, onRefreshAll, readViewMode } =
    renderBindings();

  act(() => {
    layoutProps.onImportFileChange(null);
    layoutProps.onStorageManagerOpen();
    layoutProps.onStorageManagerClose();
    layoutProps.onConfirmDialogClose();
    layoutProps.onStorageCleanup({ id: 'cleanup' });
    layoutProps.onPendingExportClose();
    layoutProps.onBackupExportConfirm({ scope: 'all' });
    void layoutProps.onBackupExportInspect({ scope: 'all' });
    layoutProps.onPendingImportClose();
    layoutProps.onImport('replace');
    layoutProps.onPreviewInspectorToggle();
    layoutProps.onPreviewClose();
    layoutProps.onRemoveTag('alpha');
    layoutProps.onPreviewResetChanges();
    layoutProps.onPreviewDelete({ id: 'asset-1' });
    layoutProps.onPreviewOpenSnapshotScreenshot();
    layoutProps.onExportBackup();
    layoutProps.onImportBackupClick();
    layoutProps.onRefresh();
    layoutProps.onBannerDismiss();
    layoutProps.onApplySelectionTag();
    layoutProps.onSelectionZip();
    layoutProps.onDeleteMany([{ id: 'asset-2' }]);
    layoutProps.onClearSelection();
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
  expect(onRefreshAll).toHaveBeenCalledTimes(1);
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
