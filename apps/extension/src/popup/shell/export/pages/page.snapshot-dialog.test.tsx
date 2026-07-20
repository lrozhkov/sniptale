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
    await mocks.loadSettings.mock.results.at(-1)?.value;
  });
}

function getButtonByText(text: string): HTMLButtonElement | null {
  return (
    Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes(text)
    ) ?? null
  );
}

function getSnapshotDialog(): HTMLElement | null {
  return container?.querySelector<HTMLElement>('[role="alertdialog"]') ?? null;
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
  mocks.patchSettings.mockResolvedValue({ skipWebSnapshotSaveDisclosure: true });
  mocks.usePopupExportController.mockReturnValue(createPopupExportControllerFixture());
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

it('keeps confirmation open when storing skip preference fails', async () => {
  const handleSaveWebSnapshot = vi.fn();
  mocks.patchSettings.mockRejectedValueOnce(new Error('persist failed'));
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ actions: { handleSaveWebSnapshot } })
  );

  await renderExportPage();
  await settleLastSettingsLoad();

  await act(async () => {
    mocks.exportFooterActions.mock.calls.at(-1)![0].onSaveWebSnapshot?.();
  });
  await act(async () => {
    container?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    getButtonByText('Подтвердить')?.click();
  });
  await flushMicrotasks();

  expect(mocks.patchSettings).toHaveBeenCalledWith({ skipWebSnapshotSaveDisclosure: true });
  expect(handleSaveWebSnapshot).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('Не удалось сохранить выбор');
  expect(getSnapshotDialog()).not.toBeNull();
});

it('closes confirmation with Escape without saving', async () => {
  const handleSaveWebSnapshot = vi.fn();
  mocks.usePopupExportController.mockReturnValue(
    createPopupExportControllerFixture({ actions: { handleSaveWebSnapshot } })
  );

  await renderExportPage();
  await settleLastSettingsLoad();

  await act(async () => {
    mocks.exportFooterActions.mock.calls.at(-1)![0].onSaveWebSnapshot?.();
  });
  expect(getSnapshotDialog()).not.toBeNull();

  await act(async () => {
    getSnapshotDialog()?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    );
  });

  expect(handleSaveWebSnapshot).not.toHaveBeenCalled();
  expect(getSnapshotDialog()).toBeNull();
});
