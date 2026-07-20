// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { createVideoCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/test-support';
import type { ExportFooterActions } from '../footer/actions';

const mocks = vi.hoisted(() => ({
  exportFooterActionsMock: vi.fn(),
  exportPageContentMock: vi.fn(),
  loadSettings: vi.fn(),
  usePopupExportControllerMock: vi.fn(),
}));

vi.mock('../footer/actions', () => ({
  ExportFooterActions: (props: unknown) => {
    mocks.exportFooterActionsMock(props);
    return <div data-testid="export-footer-actions">footer</div>;
  },
}));

vi.mock('./content', () => ({
  ExportPageContent: (props: unknown) => {
    mocks.exportPageContentMock(props);
    return <div data-testid="export-page-content">content</div>;
  },
}));

vi.mock('../controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controller')>()),
  usePopupExportController: (...args: unknown[]) => mocks.usePopupExportControllerMock(...args),
}));
vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));

import { ExportPage } from './page';
import { createPopupExportControllerFixture } from './controller.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type RenderedFooterProps = Parameters<typeof ExportFooterActions>[0];

function createActiveTabCapabilities(isRestrictedPage = false): ActiveTabCapabilities {
  const supported = { reason: null, supported: true };

  return {
    export: supported,
    isRestrictedPage,
    quickActions: supported,
    restrictedPageLabel: null,
    screenshotMode: supported,
    tabId: 1,
    title: 'Example',
    url: 'https://example.test',
    videoByMode: createVideoCapabilities(supported),
  };
}

async function settleLastSettingsLoad() {
  await act(async () => {
    await mocks.loadSettings.mock.results.at(-1)?.value;
  });
}

async function renderPage(args: {
  controller?: ReturnType<typeof createPopupExportControllerFixture>;
  isRestrictedPage?: boolean;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const controller = args.controller ?? createPopupExportControllerFixture();
  mocks.usePopupExportControllerMock.mockReturnValue(controller);

  await act(async () => {
    root?.render(
      <ExportPage
        isActive
        activeTabCapabilities={createActiveTabCapabilities(args.isRestrictedPage)}
      />
    );
  });
  await settleLastSettingsLoad();

  return controller;
}

function getRenderedFooterProps(): RenderedFooterProps {
  return mocks.exportFooterActionsMock.mock.calls.at(-1)?.[0] as RenderedFooterProps;
}

function triggerFooterActions(footerProps: RenderedFooterProps) {
  footerProps.onCancelExport();
  footerProps.onCopyJson();
  footerProps.onCopyMarkdown();
  footerProps.onResetExportView();
  footerProps.onSaveWebSnapshot?.();
  footerProps.onStartExport();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.exportFooterActionsMock.mockReset();
  mocks.exportPageContentMock.mockReset();
  mocks.loadSettings.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: true,
  });
  mocks.usePopupExportControllerMock.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

async function verifyContentAndFooterWiring() {
  const controller = await renderPage({ controller: createPopupExportControllerFixture() });
  const section = container?.querySelector('section');
  const footerProps = getRenderedFooterProps();

  expect(mocks.exportPageContentMock).toHaveBeenCalledWith(expect.objectContaining({ controller }));
  expect(section?.className).toContain('rounded-[16px]');
  expect(section?.className).toContain('p-3');
  expect(container?.firstElementChild?.className).toContain('gap-3');

  triggerFooterActions(footerProps);

  expect(footerProps.copyJsonTitle).toBe('Копировать JSON текущей открытой вкладки');
  expect(footerProps.copyMarkdownTitle).toBe('Копировать Markdown текущей открытой вкладки');
  expect(footerProps.canSaveWebSnapshot).toBe(true);
  expect(footerProps.saveWebSnapshotTitle).toBe('Сохранить снимок');
  expect(controller.actions.handleCancelExport).toHaveBeenCalledTimes(1);
  expect(controller.actions.handleCopyJson).toHaveBeenCalledTimes(1);
  expect(controller.actions.handleCopyMarkdown).toHaveBeenCalledTimes(1);
  expect(controller.actions.handleSaveWebSnapshot).toHaveBeenCalledTimes(1);
  expect(controller.actions.handleStartExport).toHaveBeenCalledTimes(1);
  expect(controller.state.session.actions.setProgress).toHaveBeenCalledTimes(1);
  expect(controller.state.session.actions.setResult).toHaveBeenCalledTimes(1);
}

async function verifyRuntimeDisabledReason() {
  await renderPage({
    controller: createPopupExportControllerFixture({
      derived: {
        canExport: false,
        exportDisabledReason: 'runtime disabled',
      },
    }),
  });

  expect(getRenderedFooterProps()).toEqual(
    expect.objectContaining({
      disabledTitle: 'runtime disabled',
    })
  );
}

async function verifyRestrictedPageTitle() {
  await renderPage({
    controller: createPopupExportControllerFixture({
      derived: {
        canExport: false,
        exportDisabledReason: 'runtime disabled',
      },
    }),
    isRestrictedPage: true,
  });

  expect(getRenderedFooterProps()).toEqual(
    expect.objectContaining({
      disabledTitle: 'На этой странице часть функций недоступна',
    })
  );
}

async function verifyRestrictedPageKeepsDefaultExportTitleWhenBatchExportIsEnabled() {
  await renderPage({
    controller: createPopupExportControllerFixture({
      derived: {
        canExport: true,
        exportDisabledReason: null,
      },
    }),
    isRestrictedPage: true,
  });

  expect(getRenderedFooterProps()).not.toHaveProperty('disabledTitle');
}

async function verifyDoneFooterState() {
  await renderPage({
    controller: createPopupExportControllerFixture({
      session: {
        result: {
          success: true,
          errors: [],
          filename: 'export.zip',
          stats: {
            filesCount: 0,
            filesFailed: 0,
            rowsCount: 0,
            sectionsCount: 0,
          },
        },
      },
    }),
  });

  expect(getRenderedFooterProps()).toEqual(
    expect.objectContaining({
      isResultReady: true,
    })
  );
}

async function verifyDoneFooterStateForErrorProgress() {
  await renderPage({
    controller: createPopupExportControllerFixture({
      session: {
        progress: {
          activeStepKey: null,
          current: 0,
          errors: ['stale runtime'],
          message: 'stale runtime',
          phase: 'error',
          total: 0,
        },
        result: null,
      },
    }),
  });

  expect(getRenderedFooterProps()).toEqual(
    expect.objectContaining({
      isResultReady: true,
    })
  );
}

describe('ExportPage', () => {
  it('passes the controller to content and wires footer handlers', verifyContentAndFooterWiring);

  it(
    'uses the runtime export-disabled reason when the page is not restricted',
    verifyRuntimeDisabledReason
  );

  it(
    'prefers the restricted-page title over the runtime export-disabled reason',
    verifyRestrictedPageTitle
  );

  it(
    'keeps the default export title when batch export is enabled from selected pages',
    verifyRestrictedPageKeepsDefaultExportTitleWhenBatchExportIsEnabled
  );

  it('marks the footer primary action as done while a result is open', verifyDoneFooterState);
  it(
    'marks the footer primary action as done while an export error screen is open',
    verifyDoneFooterStateForErrorProgress
  );
});
