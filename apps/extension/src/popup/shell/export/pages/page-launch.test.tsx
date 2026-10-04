// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { createVideoCapabilities } from '../../test-support/video-capabilities';

const mocks = vi.hoisted(() => ({
  exportFooterActions: vi.fn(),
  loadSettings: vi.fn(),
  usePopupExportController: vi.fn(),
}));

vi.mock('../footer/actions', () => ({
  ExportFooterActions: (props: { onStartExport: () => void }) => {
    mocks.exportFooterActions(props);
    return <div data-testid="export-footer-actions">footer</div>;
  },
}));

vi.mock('./content', () => ({
  ExportPageContent: () => <div data-testid="export-page-content">content</div>,
}));

vi.mock('../controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controller')>()),
  usePopupExportController: (...args: unknown[]) => mocks.usePopupExportController(...args),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));

import { ExportPage } from './page';
import { startPopupExport } from '../runtime/start';
import { createPopupExportRuntimeState } from '../runtime/state';
import type { PopupExportRuntimeDeps } from '../runtime/types';
import { createPopupExportControllerFixture } from './controller.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createActiveTabCapabilities(): ActiveTabCapabilities {
  const supported = { reason: null, supported: true };
  return {
    export: supported,
    isRestrictedPage: false,
    quickActions: supported,
    restrictedPageLabel: null,
    screenshotMode: supported,
    tabId: 7,
    title: 'Review',
    url: 'https://example.test',
    videoByMode: createVideoCapabilities(supported),
  };
}

async function renderPage(args: {
  controller: ReturnType<typeof createPopupExportControllerFixture>;
  launch?: { tabId: number; startExport: boolean; sourceDocumentId?: string };
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  mocks.usePopupExportController.mockReturnValue(args.controller);
  await act(async () => {
    root?.render(
      <ExportPage
        isActive
        activeTabCapabilities={createActiveTabCapabilities()}
        {...(args.launch ? { launch: args.launch } : {})}
      />
    );
  });
  await act(async () => {
    await mocks.loadSettings.mock.results.at(-1)?.value;
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.exportFooterActions.mockReset();
  mocks.loadSettings.mockReset();
  mocks.loadSettings.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: false,
  });
  mocks.usePopupExportController.mockReset();
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
  }
});

it('waits for exact-tab readiness, starts once, and leaves manual retry available', async () => {
  const controller = createPopupExportControllerFixture({
    derived: { canExport: false },
    tabs: { selectedTabIdsInOrder: [9] },
  });
  const launch = { tabId: 7, startExport: true, sourceDocumentId: 'document-7' };
  await renderPage({ controller, launch });
  expect(controller.actions.handleStartExport).not.toHaveBeenCalled();
  controller.state.derived.canExport = true;
  await renderPage({ controller, launch });
  expect(controller.actions.handleStartExport).not.toHaveBeenCalled();
  controller.state.tabs.selectedTabIdsInOrder = [7];
  await renderPage({ controller, launch: { ...launch } });
  expect(controller.actions.handleStartExport).toHaveBeenCalledOnce();
  controller.state.session.transfer.progress.phase = 'error';
  await renderPage({ controller, launch: { ...launch } });
  expect(controller.actions.handleStartExport).toHaveBeenCalledOnce();
  const footer = mocks.exportFooterActions.mock.calls.at(-1)?.[0] as {
    onStartExport: () => void;
  };
  act(() => footer.onStartExport());
  expect(controller.actions.handleStartExport).toHaveBeenCalledTimes(2);
});

it('opens configuration without auto-start when the launch or source document is missing', async () => {
  const controller = createPopupExportControllerFixture({
    derived: { canExport: true },
    tabs: { selectedTabIdsInOrder: [7] },
  });
  await renderPage({ controller, launch: { tabId: 7, startExport: false } });
  expect(controller.actions.handleStartExport).not.toHaveBeenCalled();
  await renderPage({ controller, launch: { tabId: 7, startExport: true } });
  expect(controller.actions.handleStartExport).not.toHaveBeenCalled();
});

it('submits the selected artifacts and bound source document through the real starter', async () => {
  const controller = createPopupExportControllerFixture({
    derived: { canExport: true },
    tabs: {
      selectedTabIds: [7],
      selectedTabIdsInOrder: [7],
      selectedCount: 1,
      availableTabs: [
        {
          tabId: 7,
          title: 'Review',
          url: 'https://example.test',
          isCurrent: true,
          disabledReason: null,
        },
      ],
    },
  });
  controller.state.preferences.values.includeAnnotations = false;
  controller.state.preferences.values.includeJson = false;
  controller.state.preferences.values.includeMarkdown = true;
  controller.state.preferences.values.includeFiles = false;
  controller.state.preferences.values.includeImages = false;
  const sendStartJobMessage = vi.fn<NonNullable<PopupExportRuntimeDeps['sendStartJobMessage']>>(
    async () => ({ success: false as const, error: 'download unavailable' })
  );
  const deps: PopupExportRuntimeDeps = {
    clearTimeout: vi.fn(),
    createRequestId: () => 'review-export',
    getActiveTabId: vi.fn(),
    requestPreview: vi.fn(),
    scheduleTimeout: vi.fn(),
    writeClipboardText: vi.fn(),
    sendStartJobMessage,
  };
  controller.actions.handleStartExport = (format, startContext) =>
    startPopupExport(
      createPopupExportRuntimeState(controller.state),
      deps,
      'export',
      format,
      startContext
    );
  await renderPage({
    controller,
    launch: { tabId: 7, startExport: true, sourceDocumentId: 'document-7' },
  });

  expect(sendStartJobMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'START_PAGE_PACKAGE_JOB',
      intent: 'export',
      sourceDocumentId: 'document-7',
      sources: [{ kind: 'tab', tabId: 7, title: 'Review' }],
      options: expect.objectContaining({
        includeJson: false,
        includeMarkdown: true,
        includeFiles: false,
        includeImages: false,
      }),
    })
  );
  expect(controller.state.session.actions.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({ phase: 'error' })
  );
});
