// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { createVideoCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/test-support';
import type { ExportFooterActions } from '../footer/actions';

type ExportFooterActionsProps = Parameters<typeof ExportFooterActions>[0];

const mocks = vi.hoisted(() => ({
  exportFooterActions: vi.fn<(props: ExportFooterActionsProps) => void>(),
  loadSettings: vi.fn(),
  patchSettings: vi.fn(),
  usePopupExportController: vi.fn(),
}));

vi.mock('../footer/actions', () => ({
  ExportFooterActions: (props: ExportFooterActionsProps) => {
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
  patchSettings: mocks.patchSettings,
}));

import { ExportPage } from './page';
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
    tabId: 1,
    title: 'Example',
    url: 'https://example.test',
    videoByMode: createVideoCapabilities(supported),
  };
}

async function renderExportPage() {
  await act(async () => {
    root?.render(<ExportPage isActive activeTabCapabilities={createActiveTabCapabilities()} />);
  });
}

async function settleLastSettingsLoad() {
  await act(async () => {
    try {
      await mocks.loadSettings.mock.results.at(-1)?.value;
    } catch {
      return;
    }
  });
}

function getLatestFooterProps(): ExportFooterActionsProps {
  return mocks.exportFooterActions.mock.calls.at(-1)![0];
}

function getButtonByText(text: string): HTMLButtonElement | null {
  return (
    Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes(text)
    ) ?? null
  );
}

async function flushMicrotasks(turns = 5) {
  for (let turn = 0; turn < turns; turn += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.exportFooterActions.mockReset();
  mocks.loadSettings.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
  });
  mocks.patchSettings.mockReset();
  mocks.patchSettings.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: true,
  });
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({
      derived: { isExporting: true },
      session: {
        progress: {
          activeStepKey: null,
          current: 0,
          errors: [],
          message: 'Сохраняем веб-снимок...',
          phase: 'scanning',
          total: 0,
        },
      },
    })
  );
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

it('marks the snapshot footer action while snapshot saving is active', async () => {
  await renderExportPage();

  expect(mocks.exportFooterActions).toHaveBeenCalledWith(
    expect.objectContaining({
      canSaveWebSnapshot: false,
      isSavingWebSnapshot: true,
    })
  );
});

it('opens the snapshot confirmation while web snapshot asset settings are still loading', async () => {
  const handleSaveWebSnapshot = vi.fn();
  mocks.loadSettings.mockReturnValueOnce(new Promise(() => undefined));
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ actions: { handleSaveWebSnapshot } })
  );

  await renderExportPage();

  const footerProps = getLatestFooterProps();
  expect(footerProps.canSaveWebSnapshot).toBe(true);

  await act(async () => {
    footerProps.onSaveWebSnapshot?.();
  });
  expect(handleSaveWebSnapshot).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('Сохранить веб-снимок?');
  expect(container?.textContent).toContain('Проверяем настройки ресурсов');
  expect(container?.textContent).toContain('могут попасть в локальную копию');
});

it('opens the snapshot confirmation when web snapshot asset settings cannot be loaded', async () => {
  const handleSaveWebSnapshot = vi.fn();
  mocks.loadSettings.mockRejectedValueOnce(new Error('settings unavailable'));
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ actions: { handleSaveWebSnapshot } })
  );

  await renderExportPage();
  await settleLastSettingsLoad();

  const footerProps = getLatestFooterProps();
  await act(async () => {
    footerProps.onSaveWebSnapshot?.();
  });
  expect(handleSaveWebSnapshot).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('Не удалось проверить настройки ресурсов');
  expect(container?.textContent).toContain('если они включены');
});

it('confirms snapshot saving and stores skip preference only after confirmation', async () => {
  const handleSaveWebSnapshot = vi.fn();
  mocks.loadSettings.mockResolvedValueOnce({
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: true,
    skipWebSnapshotSaveDisclosure: false,
  });
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ actions: { handleSaveWebSnapshot } })
  );

  await renderExportPage();
  await settleLastSettingsLoad();

  const footerProps = getLatestFooterProps();
  await act(async () => {
    footerProps.onSaveWebSnapshot?.();
  });
  expect(handleSaveWebSnapshot).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('ресурсы с этого сайта и внешние ресурсы');

  await act(async () => {
    container?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    getButtonByText('Отмена')?.click();
  });
  expect(handleSaveWebSnapshot).not.toHaveBeenCalled();
  expect(mocks.patchSettings).not.toHaveBeenCalled();
  expect(container?.textContent).not.toContain('Сохранить веб-снимок?');

  await act(async () => {
    getLatestFooterProps().onSaveWebSnapshot?.();
  });
  await act(async () => {
    container?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    getButtonByText('Подтвердить')?.click();
  });
  await flushMicrotasks();

  expect(mocks.patchSettings).toHaveBeenCalledWith({ skipWebSnapshotSaveDisclosure: true });
  expect(handleSaveWebSnapshot).toHaveBeenCalledTimes(1);

  await act(async () => {
    getLatestFooterProps().onSaveWebSnapshot?.();
  });
  expect(container?.textContent).not.toContain('Сохранить веб-снимок?');
  expect(handleSaveWebSnapshot).toHaveBeenCalledTimes(2);
});

it('saves snapshots directly when disclosure skip preference is already stored', async () => {
  const handleSaveWebSnapshot = vi.fn();
  mocks.loadSettings.mockResolvedValueOnce({
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: true,
    skipWebSnapshotSaveDisclosure: true,
  });
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ actions: { handleSaveWebSnapshot } })
  );

  await renderExportPage();
  await settleLastSettingsLoad();

  getLatestFooterProps().onSaveWebSnapshot?.();

  expect(container?.textContent).not.toContain('Сохранить веб-снимок?');
  expect(mocks.patchSettings).not.toHaveBeenCalled();
  expect(handleSaveWebSnapshot).toHaveBeenCalledTimes(1);
});

it('confirms snapshot saving without storing skip preference when the checkbox is clear', async () => {
  const handleSaveWebSnapshot = vi.fn();
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ actions: { handleSaveWebSnapshot } })
  );

  await renderExportPage();
  await settleLastSettingsLoad();

  await act(async () => {
    getLatestFooterProps().onSaveWebSnapshot?.();
  });
  await act(async () => {
    getButtonByText('Подтвердить')?.click();
  });

  expect(mocks.patchSettings).not.toHaveBeenCalled();
  expect(handleSaveWebSnapshot).toHaveBeenCalledTimes(1);
});
