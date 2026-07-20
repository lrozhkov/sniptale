// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';
import { buildAppearanceContextMenuOptions } from './copy';
import { AppearanceSectionContent } from './content';

type AppearanceSectionContentState = Parameters<typeof AppearanceSectionContent>[0]['state'];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(
  overrides: Partial<AppearanceSectionContentState> = {}
): AppearanceSectionContentState {
  return {
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    rawDiagnosticsEnabled: false,
    contextMenu: {
      enabled: true,
      showExport: true,
      showGallery: true,
      showPageLinkCopy: true,
      showImageEditor: true,
      showScreenshots: true,
      showSettings: true,
      showVideo: true,
      showVideoEditor: true,
    },
    contextMenuOptions: buildAppearanceContextMenuOptions('ru'),
    languagePreference: 'ru',
    locale: 'ru',
    localeOptions: [{ label: 'Русский', value: 'ru' }],
    preference: 'system',
    resolvedTheme: 'light',
    setLanguagePreference: vi.fn(),
    setPreference: vi.fn(),
    themeOptions: [
      { description: 'desc', label: 'System', value: 'system' },
      { description: 'desc', label: 'Light', value: 'light' },
      { description: 'desc', label: 'Dark', value: 'dark' },
    ],
    updateAuthenticatedSnapshotAssetsEnabled: vi.fn().mockResolvedValue(undefined),
    updateAnonymousCrossOriginSnapshotAssetsEnabled: vi.fn().mockResolvedValue(undefined),
    updateRawDiagnosticsEnabled: vi.fn().mockResolvedValue(undefined),
    updateContextMenu: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function renderWithState(state: AppearanceSectionContentState) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<AppearanceSectionContent state={state} />);
  });
}

describe('AppearanceSectionContent', () => {
  beforeEach(setupAppearanceContentTest);

  afterEach(cleanupAppearanceContentTest);

  it('renders the context menu controls including the settings toggle', verifyContextMenuControls);
  it(
    'toggles the targeted context menu item through the provided handler',
    verifyContextMenuToggle
  );
  it(
    'toggles authenticated web snapshot assets through the provided handler',
    verifySnapshotAssetToggle
  );
  it('hides authenticated web snapshot warning when disabled', verifyDisabledSnapshotWarning);
  it(
    'toggles anonymous cross-origin web snapshot assets through the provided handler',
    verifyAnonymousSnapshotAssetToggle
  );
  it(
    'does not expose persistent raw HAR diagnostics as a settings toggle',
    verifyRawDiagnosticsHidden
  );
});

function setupAppearanceContentTest(): void {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
}

async function verifyDisabledSnapshotWarning(): Promise<void> {
  await renderWithState(createState({ authenticatedSnapshotAssetsEnabled: false }));

  expect(container?.textContent).not.toContain(
    'может добавить в сохранённый файл приватные ресурсы'
  );
}

function cleanupAppearanceContentTest(): void {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
}

async function verifyContextMenuControls(): Promise<void> {
  const state = createState();

  await renderWithState(state);

  expect(container?.textContent).toContain(translate('settings.navigation.appearance', 'ru'));
  expect(container?.textContent).toContain(translate('settings.appearance.themeModeLabel', 'ru'));
  expect(container?.textContent).toContain(
    translate('settings.appearance.languagePreferenceLabel', 'ru')
  );
  expect(container?.textContent).toContain('Веб-снимки');
  expect(container?.textContent).toContain('Загружать ресурсы текущего сайта');
  expect(container?.textContent).toContain('может добавить в сохранённый файл приватные ресурсы');
  expect(container?.textContent).toContain('Загружать внешние ресурсы');
  expect(container?.textContent).toContain('Встраивание в контекстное меню');
  expect(container?.textContent).toContain('Копировать название и ссылку');
  expect(container?.textContent).toContain('Настройки');
  expectContextMenuButtons();
}

function expectContextMenuButtons(): void {
  expect(
    container?.querySelector('button[aria-label="Встраивание в контекстное меню"]')
  ).toBeTruthy();
  expect(container?.querySelector('button[aria-label="Снимки"]')).toBeTruthy();
  expect(
    container?.querySelector('button[aria-label="Копировать название и ссылку"]')
  ).toBeTruthy();
  expect(container?.querySelector('button[aria-label="Настройки"]')).toBeTruthy();
}

async function verifyContextMenuToggle(): Promise<void> {
  const state = createState();

  await renderWithState(state);

  const pageLinkToggle = container?.querySelector(
    'button[aria-label="Копировать название и ссылку"]'
  ) as HTMLButtonElement;
  expect(pageLinkToggle).toBeTruthy();

  await act(async () => {
    pageLinkToggle.click();
  });

  expect(state.updateContextMenu).toHaveBeenCalledWith({ showPageLinkCopy: false });
}

async function verifySnapshotAssetToggle(): Promise<void> {
  const state = createState();

  await renderWithState(state);

  const snapshotAssetsToggle = container?.querySelector(
    'button[aria-label="Загружать ресурсы текущего сайта"]'
  ) as HTMLButtonElement;
  expect(snapshotAssetsToggle).toBeTruthy();

  await act(async () => {
    snapshotAssetsToggle.click();
  });

  expect(state.updateAuthenticatedSnapshotAssetsEnabled).toHaveBeenCalledWith(false);
}

async function verifyAnonymousSnapshotAssetToggle(): Promise<void> {
  const state = createState();

  await renderWithState(state);

  const snapshotAssetsToggle = container?.querySelector(
    'button[aria-label="Загружать внешние ресурсы"]'
  ) as HTMLButtonElement;
  expect(snapshotAssetsToggle).toBeTruthy();

  await act(async () => {
    snapshotAssetsToggle.click();
  });

  expect(state.updateAnonymousCrossOriginSnapshotAssetsEnabled).toHaveBeenCalledWith(true);
}

async function verifyRawDiagnosticsHidden(): Promise<void> {
  const state = createState();

  await renderWithState(state);

  expect(container?.textContent).not.toContain('Сохранять расширенную диагностику');
  expect(state.updateRawDiagnosticsEnabled).not.toHaveBeenCalled();
}
