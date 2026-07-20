// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createController } from '../../library/actions/test-support/index';
import type { UseGalleryAppActionsResult } from '../../library/actions/useGalleryAppActions.types';

const mocks = vi.hoisted(() => ({
  buildGalleryCommandPaletteActions: vi.fn(() => [{ id: 'open-project', label: 'Open project' }]),
  commandPaletteProps: vi.fn(),
}));

vi.mock('../../../ui/command-palette', () => ({
  CommandPalette: (props: Record<string, unknown>) => {
    mocks.commandPaletteProps(props);
    return <div data-testid="gallery-command-palette" />;
  },
}));

vi.mock('./actions', () => ({
  buildGalleryCommandPaletteActions: mocks.buildGalleryCommandPaletteActions,
}));

import { GalleryCommandPalette } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

function createActions(): UseGalleryAppActionsResult {
  return {
    backup: createBackupActions(),
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
      deleteMany: vi.fn(async () => undefined),
      downloadZip: vi.fn(async () => undefined),
    },
    storage: {
      cleanup: vi.fn(async () => undefined),
    },
  };
}

function createBackupActions(): UseGalleryAppActionsResult['backup'] {
  return {
    closePendingExport: vi.fn(),
    confirmExport: vi.fn(async () => undefined),
    exportBackup: vi.fn(async () => undefined),
    inspectExport: vi.fn(async () => ({
      approximateSizeBytes: 0,
      assetCount: 0,
      dataClasses: {
        editorDrafts: false,
        mediaAssets: false,
        recordings: false,
        scenarioProjects: false,
        sourceMetadata: false,
        telemetry: false,
        thumbnails: false,
        videoProjects: false,
        webSnapshots: false,
      },
      editorDraftCount: 0,
      recordingCount: 0,
      scenarioProjectCount: 0,
      selectedCount: 0,
      sourceMetadataCount: 0,
      thumbnailCount: 0,
      videoProjectCount: 0,
      webSnapshotCount: 0,
    })),
  };
}

it('builds gallery command actions and forwards the canonical command palette props', () => {
  const { controller } = createController();
  const actions = createActions();
  const onClose = vi.fn();

  act(() => {
    root?.render(
      <GalleryCommandPalette
        controller={controller}
        actions={actions}
        isOpen
        onClose={onClose}
        onRefresh={vi.fn()}
      />
    );
  });

  expect(mocks.buildGalleryCommandPaletteActions).toHaveBeenCalledWith(
    controller,
    actions,
    expect.any(Function)
  );
  expect(mocks.commandPaletteProps).toHaveBeenCalledWith(
    expect.objectContaining({
      actions: [{ id: 'open-project', label: 'Open project' }],
      dataUi: 'gallery.command-palette',
      isOpen: true,
      onClose,
      storageKey: 'sniptale.gallery.command-palette',
    })
  );
});
