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
    includeDrafts: false,
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
import type { BackupExportModalProps } from './types';
import { galleryBackupExportModalMessages } from '../../../platform/i18n/messages/gallery/backup-export-modal';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createExportOptions(
  overrides: Partial<MediaHubBackupExportOptions> = {}
): MediaHubBackupExportOptions {
  return {
    ...overrides,
    includeDrafts: overrides.includeDrafts ?? false,
    includeSourceMetadata: overrides.includeSourceMetadata ?? true,
    includeTelemetry: overrides.includeTelemetry ?? true,
    includeWebSnapshots: overrides.includeWebSnapshots ?? true,
    scope: overrides.scope ?? 'all',
  };
}

function createLocalSummary(): MediaHubLocalBackupSummary {
  return {
    approximateSizeBytes: 4096,
    assetCount: 5,
    draftCount: 0,
    dataClasses: {
      drafts: false,
      mediaAssets: true,
      recordings: true,
      savedViews: true,
      scenarioProjects: true,
      sourceMetadata: true,
      telemetry: true,
      thumbnails: true,
      videoProjects: true,
      webSnapshots: true,
    },
    recordingCount: 3,
    savedViewCount: 2,
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
  summary?: MediaHubLocalBackupSummary | null;
  preparation?: BackupExportModalProps['preparation'];
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
        summary={args.summary === undefined ? createLocalSummary() : args.summary}
        {...(args.preparation === undefined ? {} : { preparation: args.preparation })}
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
  translateMock.mockImplementation((key: string) => key);
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
  expect(container?.textContent).toContain('gallery.backupExportModal.classSavedViews');
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
  expect(container?.textContent).not.toContain('gallery.backupExportModal.supportBundle');

  await act(async () => {
    const draftsToggle = container?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    draftsToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });

  expect(container?.textContent).toContain('gallery.backupExportModal.supportBundle');

  await act(async () => {
    findButton('gallery.backupExportModal.export').dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await Promise.resolve();
  });

  expect(onExport).toHaveBeenCalledWith(
    expect.objectContaining({
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
  expect(
    Array.from(container?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []).every(
      (checkbox) => checkbox.classList.contains('sniptale-checkbox')
    )
  ).toBe(true);
  expect(
    Array.from(container?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []).every(
      (checkbox) => checkbox.closest('label')?.classList.contains('cursor-pointer')
    )
  ).toBe(true);

  await act(async () => {
    const telemetryToggle = container?.querySelectorAll('input[type="checkbox"]')[1];
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

it('keeps catalog confirmation and privacy changes metadata-only before downloading a full backup', async () => {
  const onInspect = vi.fn();
  const onExport = vi.fn(async () => undefined);
  const options = createExportOptions();
  act(() =>
    root?.render(
      <BackupExportModalContent
        options={options}
        summary={null}
        preparation={{
          binding: {
            provider: 'webdav',
            rootUrl: 'https://dav.example/',
            accountId: 'user',
            spaceId: 'space',
            connectionGeneration: 1,
            profileCreatedAt: 1,
          },
          authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
          missing: [
            {
              rootKind: 'video-project',
              rootId: 'remote',
              operationId: 'op',
              sourceDigest: 'a'.repeat(64),
            },
          ],
          nativeRootCount: 2,
          remoteBytesUpperBound: 4096,
        }}
        onInspect={onInspect}
        onExport={onExport}
        onClose={vi.fn()}
      />
    )
  );
  await act(async () => {
    const toggle = container!.querySelector('input[type="checkbox"]');
    if (!(toggle instanceof HTMLInputElement)) throw new Error('Privacy toggle missing.');
    toggle.click();
  });
  expect(onInspect).not.toHaveBeenCalled();
  expect(onExport).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('gallery.backupExportModal.remotePreparation');
  expect(container?.textContent).toContain('gallery.backupExportModal.scopeAll');
  await act(async () => findButton('gallery.backupExportModal.downloadAndExport').click());
  expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ includeDrafts: true }));
});

function preparation(missingCount: 0 | 1): NonNullable<BackupExportModalProps['preparation']> {
  return {
    binding: {
      provider: 'webdav',
      rootUrl: 'https://dav.example/',
      accountId: 'fixture',
      spaceId: 'space',
      connectionGeneration: 1,
      profileCreatedAt: 1,
    },
    authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
    missing: missingCount
      ? [
          {
            rootKind: 'video-project',
            rootId: 'remote',
            operationId: 'op',
            sourceDigest: 'a'.repeat(64),
          },
        ]
      : [],
    nativeRootCount: 0,
    remoteBytesUpperBound: missingCount ? 4096 : 0,
  };
}

it.each(['en', 'ru'] as const)(
  'does not describe a selected backup as the whole Library or promise a stale size in %s',
  async (locale) => {
    translateMock.mockImplementation((key: string) =>
      key === 'gallery.backupExportModal.remotePreparation'
        ? galleryBackupExportModalMessages.remotePreparation[locale]
        : key === 'gallery.backupExportModal.nativePreparation'
          ? galleryBackupExportModalMessages.nativePreparation[locale]
          : key
    );
    const selected = {
      mediaAssetIds: ['chosen-media'],
      scenarioProjectIds: ['chosen-scenario'],
      videoProjectIds: [],
    };
    const onInspect = vi.fn();
    const onExport = vi.fn(async () => undefined);
    const onClose = vi.fn();
    renderBackupExportModal({
      options: createExportOptions({ scope: 'selected', selected }),
      summary: null,
      preparation: preparation(0),
      onInspect,
      onExport,
      onClose,
    });
    expect(container?.textContent).toContain('gallery.backupExportModal.scopeSelected');
    expect(container?.textContent).not.toMatch(/local library|текущего каталога сервера/iu);
    expect(container?.textContent).not.toContain('shared.bytes.zero');
    expect(container?.textContent).not.toContain('gallery.backupExportModal.remoteRoots');
    expect(container?.textContent).not.toContain('gallery.backupExportModal.remoteSize');
    expect(container?.textContent).not.toMatch(
      /not included above|не включён в оценку|at most|не более/iu
    );
    expect(container?.textContent).toMatch(
      locale === 'en'
        ? /chosen items.*related files/iu
        : /выбранные материалы.*связанные с ними файлы/iu
    );
    expect(container?.textContent).toMatch(
      locale === 'en'
        ? /Missing files download after confirmation/iu
        : /Недостающие файлы.*после подтверждения/iu
    );
    expect(container?.textContent).toMatch(
      locale === 'en'
        ? /Cancellation keeps completed downloads/iu
        : /Отмена сохранит уже скачанные данные/iu
    );
    await act(async () => {
      const toggles = container!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
      toggles[0]!.click();
      toggles[3]!.click();
    });
    expect(onInspect).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
    await act(async () => findButton('gallery.backupExportModal.downloadAndExport').click());
    expect(onExport).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        scope: 'selected',
        selected,
        includeDrafts: true,
        includeWebSnapshots: false,
      })
    );
    await act(async () => findButton('common.actions.cancel').click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledOnce();
  }
);

it('keeps full-library confirmation honest after options change while the old preparation plan remains', async () => {
  const onInspect = vi.fn();
  const onExport = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const oldPlan = preparation(1);
  renderBackupExportModal({
    options: createExportOptions(),
    summary: null,
    preparation: oldPlan,
    onInspect,
    onExport,
    onClose,
  });
  expect(container?.textContent).toContain('gallery.backupExportModal.scopeAll');
  await act(async () => findButton('gallery.backupExportModal.supportBundle').click());
  expect(container?.textContent).not.toContain('4 shared.bytes.kb');
  expect(container?.textContent).not.toContain('gallery.backupExportModal.remoteSize');
  expect(onInspect).not.toHaveBeenCalled();
  expect(onExport).not.toHaveBeenCalled();
  await act(async () => findButton('common.actions.cancel').click());
  expect(onClose).toHaveBeenCalledOnce();
  expect(onExport).not.toHaveBeenCalled();
});
