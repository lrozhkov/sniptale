// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { backupExportPropsMock, importPropsMock, storagePropsMock } = vi.hoisted(() => ({
  backupExportPropsMock: vi.fn(),
  importPropsMock: vi.fn(),
  storagePropsMock: vi.fn(),
}));

vi.mock('./backup-export-content', () => ({
  BackupExportModalContent: (props: unknown) => {
    backupExportPropsMock(props);
    return <div data-ui="test.backup-export-content" />;
  },
}));

vi.mock('./import-conflict-content', () => ({
  ImportConflictModalContent: (props: unknown) => {
    importPropsMock(props);
    return <div data-ui="test.import-content" />;
  },
}));

vi.mock('./storage-manager-content', () => ({
  StorageManagerModalContent: (props: unknown) => {
    storagePropsMock(props);
    return <div data-ui="test.storage-content" />;
  },
}));

import { BackupExportModal, ImportConflictModal, StorageManagerModal } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

it('forwards storage manager props to the owner-local content view', () => {
  const props = {
    report: { groups: [], potentialBytes: 12 },
    onClose: vi.fn(),
    onRun: vi.fn(async () => undefined),
  };

  act(() => {
    root?.render(<StorageManagerModal {...props} />);
  });

  expect(storagePropsMock).toHaveBeenCalledWith(props);
});

it('forwards import conflict props to the owner-local content view', () => {
  const props = {
    summary: {
      assetCount: 1,
      conflicts: ['asset-1'],
      manifest: {
        assetCount: 1,
        effectBundleCount: 0,
        exportedAt: '2026-03-31T00:00:00.000Z',
        format: 'sniptale-backup',
        thumbnailCount: 0,
        version: 1,
      },
      thumbnailCount: 0,
    },
    onClose: vi.fn(),
    onImport: vi.fn(async () => undefined),
  };

  act(() => {
    root?.render(<ImportConflictModal {...props} />);
  });

  expect(importPropsMock).toHaveBeenCalledWith(props);
});

it('forwards backup export props to the owner-local content view', () => {
  const summary = {
    approximateSizeBytes: 4096,
    assetCount: 2,
    dataClasses: {
      editorDrafts: true,
      mediaAssets: true,
      recordings: true,
      scenarioProjects: true,
      sourceMetadata: true,
      telemetry: true,
      thumbnails: true,
      videoProjects: true,
      webSnapshots: true,
    },
    editorDraftCount: 1,
    recordingCount: 1,
    scenarioProjectCount: 0,
    selectedCount: 0,
    sourceMetadataCount: 2,
    thumbnailCount: 1,
    videoProjectCount: 0,
    webSnapshotCount: 1,
  };
  const props = {
    options: {
      scope: 'all' as const,
      includeEditorDrafts: true,
      includeSourceMetadata: true,
      includeTelemetry: true,
      includeWebSnapshots: true,
    },
    summary,
    onClose: vi.fn(),
    onExport: vi.fn(async () => undefined),
    onInspect: vi.fn(async () => summary),
  };

  act(() => {
    root?.render(<BackupExportModal {...props} />);
  });

  expect(backupExportPropsMock).toHaveBeenCalledWith(props);
});
