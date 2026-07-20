// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  createController,
  createMediaItem,
  createVideoProjectItem,
} from '../../library/actions/test-support/index';
import type { UseGalleryAppActionsResult } from '../../library/actions/useGalleryAppActions.types';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { buildGalleryCommandPaletteActions } from './actions';

function createActions(): UseGalleryAppActionsResult {
  return {
    backup: {
      closePendingExport: vi.fn(),
      confirmExport: vi.fn(),
      exportBackup: vi.fn(),
      inspectExport: vi.fn(),
    },
    importing: {
      importBackup: vi.fn(),
      importSelectedFile: vi.fn(),
    },
    preview: {
      close: vi.fn(),
      copy: vi.fn(),
      download: vi.fn(),
      openInEditor: vi.fn(),
      openSnapshotScreenshotInEditor: vi.fn(),
      resetChanges: vi.fn(),
      saveMetadata: vi.fn(),
    },
    selection: {
      applyTag: vi.fn(),
      deleteMany: vi.fn(),
      downloadZip: vi.fn(),
    },
    storage: {
      cleanup: vi.fn(),
    },
  };
}

function findAction(actionId: string, overrides: Parameters<typeof createController>[0] = {}) {
  const { controller } = createController(overrides);
  controller.actions.storage.refresh = vi.fn(async () => undefined);
  controller.actions.filters.setFolderFilter = vi.fn();
  controller.actions.filters.setSortMode = vi.fn();
  controller.actions.surface.setShowStorageManager = vi.fn();
  const actions = createActions();
  const action = buildGalleryCommandPaletteActions(controller, actions).find(
    ({ id }) => id === actionId
  );

  if (!action) {
    throw new Error(`Expected action ${actionId}`);
  }

  return { action, actions, controller };
}

it('builds scenario-aware sort labels and folder toggles', () => {
  const { action: scenarioSortAction } = findAction('gallery-filter-sort-size', {
    folderFilter: 'scenario',
  });
  const { action: mediaSortAction } = findAction('gallery-filter-sort-size');
  const { action: scenarioFolderAction, controller } = findAction('gallery-filter-folder-scenario');
  const { action: webSnapshotFolderAction } = findAction('gallery-filter-folder-web-snapshot');

  expect(scenarioSortAction.title).toBe('gallery.app.sortName');
  expect(mediaSortAction.title).toBe('gallery.app.sortSize');
  expect(webSnapshotFolderAction.icon).toBeTruthy();

  scenarioFolderAction.onSelect?.();
  expect(controller.actions.filters.setFolderFilter).toHaveBeenCalledWith('scenario');
});

it('routes refresh through the override when provided and falls back to controller refresh', () => {
  const { controller } = createController();
  controller.actions.storage.refresh = vi.fn(async () => undefined);
  const onRefresh = vi.fn();
  const actions = createActions();
  const [overrideRefreshAction] = buildGalleryCommandPaletteActions(
    controller,
    actions,
    onRefresh
  ).filter(({ id }) => id === 'gallery-refresh');
  const [fallbackRefreshAction] = buildGalleryCommandPaletteActions(controller, actions).filter(
    ({ id }) => id === 'gallery-refresh'
  );

  overrideRefreshAction?.onSelect?.();
  fallbackRefreshAction?.onSelect?.();

  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
});

it('disables selection and preview actions without context and enables them when context exists', () => {
  const empty = findAction('gallery-selection-delete');
  const selection = findAction('gallery-selection-delete', {
    selectedItems: [createMediaItem()],
  });
  const preview = findAction('gallery-preview-open-editor', {
    previewItem: createMediaItem({ id: 'asset-preview' }),
  });

  expect(empty.action.disabled).toBe(true);

  selection.action.onSelect?.();
  preview.action.onSelect?.();

  expect(selection.actions.selection.deleteMany).toHaveBeenCalledWith([createMediaItem()]);
  expect(preview.actions.preview.openInEditor).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'asset-preview' })
  );

  const unavailable = findAction('gallery-preview-open-editor', {
    previewItem: createVideoProjectItem({ unavailableReason: 'unsupported-engine1' }),
  });
  expect(unavailable.action.disabled).toBe(true);
});

it('marks active filters as current context and keeps disabled reasons on guarded actions', () => {
  const { action: activeFolderAction } = findAction('gallery-filter-folder-scenario', {
    folderFilter: 'scenario',
  });
  const { action: emptyPreviewAction } = findAction('gallery-preview-download');

  expect(activeFolderAction.subtitle).toBe('shared.ui.commandPaletteCurrentContextHint');
  expect(emptyPreviewAction.disabled).toBe(true);
  expect(emptyPreviewAction.disabledReason).toBe('shared.ui.commandPaletteDisabledContextHint');
});
