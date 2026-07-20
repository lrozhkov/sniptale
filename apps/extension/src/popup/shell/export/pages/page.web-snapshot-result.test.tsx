// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  exportFooterActionsMock: vi.fn(),
  openGalleryWebSnapshotsPageMock: vi.fn(),
  openWebSnapshotViewerPageMock: vi.fn(),
  usePopupExportControllerMock: vi.fn(),
}));

vi.mock('../footer/actions', () => ({
  ExportFooterActions: (props: unknown) => {
    mocks.exportFooterActionsMock(props);
    return <div />;
  },
}));
vi.mock('./content', () => ({ ExportPageContent: () => <div /> }));
vi.mock('../controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controller')>()),
  usePopupExportController: (...args: unknown[]) => mocks.usePopupExportControllerMock(...args),
}));
vi.mock('../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/navigation/extension-pages')>()),
  openGalleryWebSnapshotsPage: mocks.openGalleryWebSnapshotsPageMock,
  openWebSnapshotViewerPage: mocks.openWebSnapshotViewerPageMock,
}));

import { ExportPage } from './page';
import { createPopupExportControllerFixture } from './controller.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createController(snapshotIds: string[], snapshotBatchSize = snapshotIds.length) {
  const result = {
    errors: [],
    kind: 'webSnapshot' as const,
    snapshotBatchSize,
    snapshotIds,
    stats: { filesCount: 4, filesFailed: 0, rowsCount: 0, sectionsCount: 4 },
    success: true as const,
  };

  return createPopupExportControllerFixture({
    session: {
      progress: {
        activeStepKey: null,
        current: 0,
        errors: [],
        message: '',
        phase: 'done',
        total: 1,
      },
      result,
    },
  });
}

function createActiveTabCapabilities(): ActiveTabCapabilities {
  const supported = { supported: true, reason: null };
  return {
    export: supported,
    isRestrictedPage: false,
    quickActions: supported,
    restrictedPageLabel: null,
    screenshotMode: supported,
    tabId: 7,
    title: 'Example',
    url: 'https://example.test/page',
    videoByMode: {
      [CaptureMode.SCREEN]: supported,
      [CaptureMode.TAB]: supported,
      [CaptureMode.TAB_CROP]: supported,
      [CaptureMode.CAMERA]: supported,
      [CaptureMode.VIEWPORT_EMULATION]: supported,
    },
  };
}

async function renderPage(controller: ReturnType<typeof createController>) {
  mocks.usePopupExportControllerMock.mockReturnValue(controller);
  await act(async () => {
    root?.render(<ExportPage isActive activeTabCapabilities={createActiveTabCapabilities()} />);
  });
  return mocks.exportFooterActionsMock.mock.calls.at(-1)?.[0] as {
    onOpenWebSnapshotResult: () => void;
    openWebSnapshotResultMode: 'gallery' | 'open';
    openWebSnapshotResultTitle: string;
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

it('adds a result action that opens a single saved web snapshot', async () => {
  const footerProps = await renderPage(createController(['snapshot-1']));

  footerProps.onOpenWebSnapshotResult();

  expect(footerProps.openWebSnapshotResultMode).toBe('open');
  expect(footerProps.openWebSnapshotResultTitle).toBe('Открыть Веб-снимок');
  expect(mocks.openWebSnapshotViewerPageMock).toHaveBeenCalledWith('snapshot-1');
});

it('opens the saved snapshot when a batch produces one snapshot with warnings', async () => {
  const footerProps = await renderPage(createController(['snapshot-1'], 2));

  footerProps.onOpenWebSnapshotResult();

  expect(footerProps.openWebSnapshotResultMode).toBe('open');
  expect(mocks.openWebSnapshotViewerPageMock).toHaveBeenCalledWith('snapshot-1');
});

it('adds a result action that opens the web snapshots gallery for multiple saved snapshots', async () => {
  const footerProps = await renderPage(createController(['snapshot-1', 'snapshot-2'], 2));

  footerProps.onOpenWebSnapshotResult();

  expect(footerProps.openWebSnapshotResultMode).toBe('gallery');
  expect(footerProps.openWebSnapshotResultTitle).toBe('Открыть Веб-снимки в Галерее');
  expect(mocks.openGalleryWebSnapshotsPageMock).toHaveBeenCalledTimes(1);
});
