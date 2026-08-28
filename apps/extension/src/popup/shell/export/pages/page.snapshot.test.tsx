// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { createVideoCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/test-support';
import type { ExportFooterActions } from '../footer/actions';

type FooterProps = Parameters<typeof ExportFooterActions>[0];
const mocks = vi.hoisted(() => ({
  exportFooterActions: vi.fn<(props: FooterProps) => void>(),
  loadSettings: vi.fn(),
  openSettingsPage: vi.fn(),
  usePopupExportController: vi.fn(),
}));

vi.mock('../footer/actions', () => ({
  ExportFooterActions: (props: FooterProps) => {
    mocks.exportFooterActions(props);
    return <div />;
  },
}));
vi.mock('./content', () => ({ ExportPageContent: () => <div /> }));
vi.mock('../controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controller')>()),
  usePopupExportController: (...args: unknown[]) => mocks.usePopupExportController(...args),
}));
vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/navigation/extension-pages')>()),
  openSettingsPage: mocks.openSettingsPage,
}));

import { ExportPage } from './page';
import { createPopupExportControllerFixture } from './controller.test-support';

let container: HTMLDivElement;
let root: Root;

function capabilities(): ActiveTabCapabilities {
  const supported = { reason: null, supported: true };
  return {
    export: supported,
    isRestrictedPage: false,
    quickActions: supported,
    restrictedPageLabel: null,
    screenshotMode: supported,
    tabId: 1,
    title: 'Example',
    url: 'https://example.test',
    videoByMode: createVideoCapabilities(supported),
  };
}

async function renderPage() {
  await act(async () =>
    root.render(<ExportPage isActive activeTabCapabilities={capabilities()} />)
  );
}

async function settleSettings() {
  await act(async () => {
    try {
      await mocks.loadSettings.mock.results.at(-1)?.value;
    } catch {
      return;
    }
  });
}

function footer(): FooterProps {
  return mocks.exportFooterActions.mock.calls.at(-1)![0];
}

function button(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(text)
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.exportFooterActions.mockReset();
  mocks.loadSettings.mockReset().mockResolvedValue({ webSnapshotEnabled: false });
  mocks.openSettingsPage.mockReset().mockResolvedValue(undefined);
  mocks.usePopupExportController.mockReset().mockReturnValue(createPopupExportControllerFixture());
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('keeps the website action enabled and opens compact setup guidance while disabled', async () => {
  const handleSaveWebSnapshot = vi.fn();
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ actions: { handleSaveWebSnapshot } })
  );
  await renderPage();
  await settleSettings();

  expect(footer().canSaveWebSnapshot).toBe(true);
  act(() => footer().onSaveWebSnapshot?.());
  expect(handleSaveWebSnapshot).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(container.textContent).toContain('Веб-снимки выключены');
  expect(container.textContent).toContain('текстом, оформлением, изображениями');

  act(() => button('Открыть настройки')?.click());
  expect(mocks.openSettingsPage).toHaveBeenCalledWith({ route: { section: 'web-snapshots' } });
});

it('keeps Library save unavailable until package preferences hydrate', async () => {
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ preferences: { hasLoadedPreferences: false } })
  );

  await renderPage();

  expect(footer().canSaveWebSnapshot).toBe(false);
});

it('saves directly after the persisted opt-in is loaded', async () => {
  const handleSaveWebSnapshot = vi.fn();
  mocks.loadSettings.mockResolvedValueOnce({ webSnapshotEnabled: true });
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ actions: { handleSaveWebSnapshot } })
  );
  await renderPage();
  await settleSettings();

  act(() => footer().onSaveWebSnapshot?.());
  expect(handleSaveWebSnapshot).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it('keeps combined download visible but requires existing Web Snapshot setup before launch', async () => {
  const handleStartExport = vi.fn();
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({
      actions: { handleStartExport },
      preferences: { includeWebCopy: true },
    })
  );
  await renderPage();
  await settleSettings();

  act(() => footer().onStartExport());

  expect(handleStartExport).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});

it('fails closed with setup guidance while settings are loading or unavailable', async () => {
  const handleSaveWebSnapshot = vi.fn();
  mocks.loadSettings.mockReturnValueOnce(new Promise(() => undefined));
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ actions: { handleSaveWebSnapshot } })
  );
  await renderPage();
  act(() => footer().onSaveWebSnapshot?.());
  expect(container.textContent).toContain('Веб-снимки выключены');
  act(() => button('Закрыть')?.click());

  act(() => root.unmount());
  root = createRoot(container);
  mocks.loadSettings.mockRejectedValueOnce(new Error('unavailable'));
  await renderPage();
  await settleSettings();
  act(() => footer().onSaveWebSnapshot?.());
  expect(container.textContent).toContain('Не удалось проверить настройку');
  expect(handleSaveWebSnapshot).not.toHaveBeenCalled();
});

it('marks the footer action while snapshot saving is active', async () => {
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({
      derived: { isExporting: true },
      session: {
        progress: {
          activeStepKey: 'webSnapshotDom',
          current: 1,
          errors: [],
          message: 'Статический документ',
          phase: 'scanning',
          total: 4,
        },
      },
    })
  );
  await renderPage();
  expect(footer()).toEqual(
    expect.objectContaining({
      canSaveWebSnapshot: false,
      isSavingWebSnapshot: true,
    })
  );
});
