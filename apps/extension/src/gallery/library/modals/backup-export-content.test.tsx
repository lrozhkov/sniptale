// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  MediaHubBackupExportOptions,
  MediaHubLocalBackupSummary,
} from '../../../workflows/media-hub-backup/index';

const { modalFramePropsMock, translateMock } = vi.hoisted(() => ({
  modalFramePropsMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    translate: translateMock,
  };
});

vi.mock('./frame', () => ({
  GalleryModalFrame: (props: { children: React.ReactNode; onClose: () => void; title: string }) => {
    modalFramePropsMock(props);
    return (
      <div data-ui="test.modal-frame">
        <button type="button" onClick={props.onClose}>
          close
        </button>
        <div>{props.title}</div>
        {props.children}
      </div>
    );
  },
}));

import { BackupExportModalContent } from './backup-export-content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createExportOptions(
  overrides: Partial<MediaHubBackupExportOptions> = {}
): MediaHubBackupExportOptions {
  return {
    scope: 'all',
    includeEditorDrafts: true,
    includeSourceMetadata: true,
    includeTelemetry: true,
    includeWebSnapshots: true,
    ...overrides,
  };
}

function createLocalSummary(): MediaHubLocalBackupSummary {
  return {
    approximateSizeBytes: 4096,
    assetCount: 5,
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
    editorDraftCount: 2,
    recordingCount: 3,
    scenarioProjectCount: 1,
    selectedCount: 0,
    sourceMetadataCount: 4,
    thumbnailCount: 5,
    videoProjectCount: 1,
    webSnapshotCount: 2,
  };
}

function createSupportBundleSummary(): MediaHubLocalBackupSummary {
  return {
    ...createLocalSummary(),
    approximateSizeBytes: 1024,
    editorDraftCount: 0,
    sourceMetadataCount: 0,
    webSnapshotCount: 0,
  };
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll('button') ?? []).find((candidate) =>
    candidate.textContent?.includes(label)
  );
  if (!button) {
    throw new Error(`Expected button ${label}`);
  }

  return button;
}

function renderBackupExportModal(args: {
  onClose?: () => void;
  onExport?: (options: MediaHubBackupExportOptions) => Promise<void>;
  onInspect?: (options: MediaHubBackupExportOptions) => Promise<MediaHubLocalBackupSummary>;
  options?: MediaHubBackupExportOptions;
}) {
  const onClose = args.onClose ?? vi.fn();
  const onExport = args.onExport ?? vi.fn(async () => undefined);
  const onInspect =
    args.onInspect ??
    vi.fn(async (options: MediaHubBackupExportOptions) =>
      options.includeSourceMetadata ? createLocalSummary() : createSupportBundleSummary()
    );

  act(() => {
    root?.render(
      <BackupExportModalContent
        options={args.options ?? createExportOptions()}
        summary={createLocalSummary()}
        onClose={onClose}
        onExport={onExport}
        onInspect={onInspect}
      />
    );
  });

  return { onClose, onExport, onInspect };
}

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

it('renders backup disclosure counts and requires an explicit export click', async () => {
  const { onExport } = renderBackupExportModal({});

  expect(modalFramePropsMock).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'gallery.backupExportModal.title' })
  );
  expect(container?.textContent).toContain('gallery.backupExportModal.classMedia');
  expect(container?.textContent).toContain('gallery.backupExportModal.classTelemetry');
  expect(container?.textContent).toContain('gallery.backupExportModal.classEditorDrafts');
  expect(container?.textContent).toContain('5');
  expect(container?.textContent).toContain('4');
  expect(container?.textContent).toContain('3');
  expect(container?.textContent).toContain('2');
  expect(onExport).not.toHaveBeenCalled();

  await act(async () => {
    findButton('gallery.backupExportModal.supportBundle').dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(container?.textContent).toContain('1 shared.bytes.kb');
  expect(container?.textContent).toContain('0');

  await act(async () => {
    findButton('gallery.backupExportModal.export').dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await Promise.resolve();
  });

  expect(onExport).toHaveBeenCalledWith(
    expect.objectContaining({
      includeEditorDrafts: false,
      includeSourceMetadata: false,
      includeTelemetry: false,
      includeWebSnapshots: false,
    })
  );
});

it('updates individual privacy toggles and closes through the modal frame', async () => {
  const { onClose, onExport } = renderBackupExportModal({
    options: createExportOptions({
      scope: 'selected',
      selected: { mediaAssetIds: ['asset-1'], scenarioProjectIds: [], videoProjectIds: [] },
    }),
  });

  expect(container?.textContent).toContain('gallery.backupExportModal.scopeSelected');

  await act(async () => {
    const telemetryToggle = container?.querySelector('input[type="checkbox"]');
    telemetryToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    findButton('gallery.backupExportModal.export').dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    findButton('close').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });

  expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ includeTelemetry: false }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
