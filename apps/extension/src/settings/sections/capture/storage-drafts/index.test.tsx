// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirmDialog: vi.fn(),
  cleanupDrafts: vi.fn(),
  getLibraryStorageUsage: vi.fn(),
  getStorageEstimateInfo: vi.fn(),
  loadSettings: vi.fn(),
  openGalleryPage: vi.fn(),
  openSettingsPage: vi.fn(),
  patchSettings: vi.fn(),
  showToast: vi.fn(),
  state: vi.fn(),
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', () => ({
  ProductConfirmDialog: (props: {
    onCancel(): void;
    onConfirm(): void | Promise<void>;
    title: ReactNode;
  }) => {
    mocks.confirmDialog(props);
    return (
      <div data-testid="confirm-dialog">
        <span>{props.title}</span>
        <button data-testid="confirm" onClick={() => void props.onConfirm()}>
          confirm
        </button>
        <button data-testid="cancel" onClick={props.onCancel}>
          cancel
        </button>
      </div>
    );
  },
}));

vi.mock('./use-storage-drafts-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./use-storage-drafts-state')>()),
  useStorageDraftsState: mocks.state,
}));
vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
  patchSettings: mocks.patchSettings,
}));
vi.mock('../../../../composition/persistence/library-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/library-lifecycle')
  >()),
  cleanupDrafts: mocks.cleanupDrafts,
  getLibraryStorageUsage: mocks.getLibraryStorageUsage,
}));
vi.mock('../../../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/media-hub/storage-capacity')>()),
  getStorageEstimateInfo: mocks.getStorageEstimateInfo,
}));
vi.mock('../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/navigation/extension-pages')>()),
  openGalleryPage: mocks.openGalleryPage,
  openSettingsPage: mocks.openSettingsPage,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.showToast }));

import { StorageDraftsSection } from '.';
import { translate } from '../../../../platform/i18n';
import {
  SettingsSectionHeader,
  SettingsSectionHeaderActionsProvider,
} from '../../../section-surface';

function SectionHarness(props: { view?: 'settings' | 'storage' }) {
  return (
    <SettingsSectionHeaderActionsProvider>
      <SettingsSectionHeader kicker="Хранилище" description="Описание" />
      <StorageDraftsSection {...(props.view === undefined ? {} : { view: props.view })} />
    </SettingsSectionHeaderActionsProvider>
  );
}

it('connects the storage policy state owner to all storage controls', async () => {
  const state = {
    busy: false,
    policy: {
      cleanupEnabled: true,
      defaultDestination: 'temporary',
      draftRetentionDays: 30,
      videoDraftRetentionDays: 7,
    },
    runCleanup: vi.fn(),
    updatePolicy: vi.fn(),
    usage: null,
  };
  mocks.state.mockReturnValue(state);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<SectionHarness />));
  expect(container.textContent).toContain(translate('settings.storageDrafts.newItemsTitle'));
  expect(container.textContent).toContain(translate('settings.storageDrafts.newItemsDescription'));
  expect(container.textContent).not.toContain(translate('settings.storageDrafts.loading'));

  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
  const click = (label: string) => {
    const button = buttons.find((candidate) => candidate.textContent?.includes(label));
    expect(button).toBeDefined();
    act(() => button?.click());
  };
  click(translate('settings.storageDrafts.resetDefaults'));

  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="confirm"]')?.click();
  });

  expect(state.updatePolicy).toHaveBeenCalledWith(
    expect.objectContaining({ cleanupEnabled: expect.any(Boolean) })
  );
  act(() => root.unmount());
  container.remove();
});

it('renders usage, policy warnings, confirmation, and editable policy fields', async () => {
  const state = {
    busy: false,
    policy: {
      cleanupEnabled: true,
      defaultDestination: 'temporary' as const,
      draftRetentionDays: 30,
      videoDraftRetentionDays: 7,
    },
    runCleanup: vi.fn(async () => undefined),
    updatePolicy: vi.fn(async () => undefined),
    usage: { available: 70, drafts: 10, library: 20, total: 30 },
  };
  mocks.state.mockReturnValue(state);
  const nativeConfirm = vi.spyOn(window, 'confirm');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<SectionHarness />));

  expect(container.textContent).toContain('30');
  const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]');
  act(() => toggle?.click());
  expect(state.updatePolicy).toHaveBeenCalledWith({ cleanupEnabled: false });

  const selects = container.querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]');
  act(() => selects[0]?.click());
  const libraryOption = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="option"]')
  ).find((candidate) =>
    candidate.textContent?.includes(translate('settings.storageDrafts.destinationLibrary'))
  );
  act(() => libraryOption?.click());
  expect(state.updatePolicy).toHaveBeenCalledWith({ defaultDestination: 'library' });

  act(() => root.render(<SectionHarness view="storage" />));
  expect(container.textContent).not.toContain(translate('settings.storageDrafts.newItemsTitle'));
  expect(container.textContent).toContain(translate('settings.storageDrafts.usageTitle'));

  const storageButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
  const clickStorageAction = (label: string) => {
    const button = storageButtons.find((candidate) => candidate.textContent?.includes(label));
    expect(button).toBeDefined();
    act(() => button?.click());
  };
  clickStorageAction(translate('settings.storageDrafts.openDrafts'));
  clickStorageAction(translate('settings.storageDrafts.deleteExpired'));
  clickStorageAction(translate('settings.storageDrafts.privacyLink'));

  expect(mocks.openGalleryPage).toHaveBeenCalledWith({ scope: 'temporary' });
  expect(state.runCleanup).toHaveBeenCalledWith(false);
  expect(mocks.openSettingsPage).toHaveBeenCalledWith({
    route: { section: 'access-data', view: 'privacy' },
  });

  const deleteAll = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.includes(translate('settings.storageDrafts.deleteAll'))
  );
  act(() => deleteAll?.click());
  expect(nativeConfirm).not.toHaveBeenCalled();
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="confirm"]')?.click();
  });
  expect(state.runCleanup).toHaveBeenCalledWith(true);

  mocks.state.mockReturnValue({
    ...state,
    policy: { ...state.policy, cleanupEnabled: false },
  });
  act(() => root.render(<SectionHarness />));
  expect(container.textContent).toContain(
    translate('settings.storageDrafts.cleanupDisabledWarning')
  );
  act(() => root.unmount());
  container.remove();
});

it('loads, updates, and cleans storage through the hook owner', async () => {
  const policy = {
    cleanupEnabled: true,
    defaultDestination: 'temporary' as const,
    draftRetentionDays: 30,
    videoDraftRetentionDays: 7,
  };
  mocks.loadSettings.mockResolvedValue({ localStoragePolicy: policy });
  mocks.getLibraryStorageUsage.mockResolvedValue({
    draftsBytes: 10,
    libraryBytes: 20,
    totalBytes: 30,
  });
  mocks.getStorageEstimateInfo.mockResolvedValue({ remaining: 70, usage: 30 });
  mocks.patchSettings.mockResolvedValue({
    localStoragePolicy: { ...policy, cleanupEnabled: false },
  });
  mocks.cleanupDrafts.mockResolvedValue({ deletedCount: 2, deletedIds: ['a', 'b'] });
  const actual = await vi.importActual<typeof import('./use-storage-drafts-state')>(
    './use-storage-drafts-state'
  );
  let latest: ReturnType<typeof actual.useStorageDraftsState> | null = null;
  function Harness() {
    latest = actual.useStorageDraftsState();
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<Harness />));
  await act(async () => Promise.resolve());

  const state = latest as ReturnType<typeof actual.useStorageDraftsState> | null;
  expect(state?.usage).toEqual({ available: 70, drafts: 10, library: 20, total: 30 });
  await act(async () => state?.updatePolicy({ cleanupEnabled: false }));
  await act(async () => state?.runCleanup(true));

  expect(mocks.patchSettings).toHaveBeenCalledWith({
    localStoragePolicy: { cleanupEnabled: false },
  });
  expect(mocks.cleanupDrafts).toHaveBeenCalledWith({ includeUnexpired: true, policy });
  expect(mocks.showToast).toHaveBeenCalled();
  act(() => root.unmount());
  container.remove();
});
