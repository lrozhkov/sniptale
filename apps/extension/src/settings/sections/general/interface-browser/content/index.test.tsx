// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import { buildAppearanceContextMenuOptions, buildPopupStartupOptions } from '../copy';
import { AppearanceSectionContent } from './index';

type AppearanceSectionContentState = Parameters<typeof AppearanceSectionContent>[0]['state'];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(
  overrides: Partial<AppearanceSectionContentState> = {}
): AppearanceSectionContentState {
  return {
    contextMenu: {
      enabled: true,
      showExport: true,
      showGallery: true,
      showPageLinkCopy: true,
      showWindowResize: true,
      showImageEditor: true,
      showScreenshots: true,
      showSettings: true,
      showVideo: true,
      showVideoEditor: true,
    },
    contextMenuOptions: buildAppearanceContextMenuOptions('ru'),
    contextMenuCatalogStatus: 'ready',
    contextMenuSettingsStatus: 'ready',
    contextMenuQuickActions: [],
    contextMenuViewportPresets: [],
    retryContextMenuCatalog: vi.fn(),
    retryContextMenuSettings: vi.fn(),
    languagePreference: 'ru',
    locale: 'ru',
    localeOptions: [{ label: 'Русский', value: 'ru' }],
    preference: 'system',
    popupStartup: {
      loading: false,
      options: buildPopupStartupOptions('ru'),
      selection: 'remember-last',
      updateSelection: vi.fn().mockResolvedValue(undefined),
    },
    resolvedTheme: 'light',
    setLanguagePreference: vi.fn(),
    setPreference: vi.fn(),
    themeOptions: [
      { description: 'desc', label: 'System', value: 'system' },
      { description: 'desc', label: 'Light', value: 'light' },
      { description: 'desc', label: 'Dark', value: 'dark' },
    ],
    updateContextMenu: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function renderWithState(state: AppearanceSectionContentState, view = 'interface') {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<AppearanceSectionContent state={state} view={view} />);
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
  it('does not expose retired raw diagnostics as a settings toggle', verifyRawDiagnosticsHidden);
  it(
    'preserves an editor draft and closes its portal when history switches views',
    verifyEditorViewSwitch
  );
  it('keeps a failed save draft and never focuses hidden editor controls', verifyHiddenSave);
});

function setupAppearanceContentTest(): void {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

  expect(container?.querySelector('section:not([hidden])')?.className).toContain('max-w-[720px]');
  expect(container?.textContent).toContain(translate('settings.appearance.themeModeLabel', 'ru'));
  expect(container?.textContent).toContain(
    translate('settings.appearance.languagePreferenceLabel', 'ru')
  );
  expect(container?.querySelector('section[hidden]')?.textContent).toContain(
    'Контекстное меню браузера'
  );
  expect(container?.querySelector('section:not([hidden])')?.textContent).not.toContain(
    'Контекстное меню браузера'
  );
  await renderWithState(state, 'context-menu');
  expect(container?.querySelector('section:not([hidden])')?.textContent).toContain(
    'Контекстное меню браузера'
  );
  expect(container?.textContent).toContain('Каталог команд');
  expect(container?.textContent).toContain('Настройки');
  expectContextMenuButtons();
}

function expectContextMenuButtons(): void {
  expect(container?.querySelector('button[aria-label="Показывать меню Sniptale"]')).toBeTruthy();
  expect(container?.querySelector('[role="tree"]')).toBeTruthy();
  expect(container?.textContent).toContain('Предпросмотр меню');
}

async function verifyContextMenuToggle(): Promise<void> {
  const state = createState();

  await renderWithState(state, 'context-menu');

  const commandToggle = container?.querySelector<HTMLButtonElement>(
    'button[aria-label^="Показывать меню Sniptale: Подготовка страницы"]'
  );
  expect(commandToggle).toBeTruthy();

  await act(async () => {
    commandToggle?.click();
  });
  expect(state.updateContextMenu).not.toHaveBeenCalled();
  const save = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (button) => button.textContent === translate('settings.appearance.contextMenuSave', 'ru')
  );
  await act(async () => save?.click());
  expect(state.updateContextMenu).toHaveBeenCalledWith({
    layout: expect.objectContaining({ version: 2 }),
  });
}

async function verifyRawDiagnosticsHidden(): Promise<void> {
  const state = createState();

  await renderWithState(state);

  expect(container?.textContent).not.toContain('Сохранять расширенную диагностику');
}

async function verifyEditorViewSwitch(): Promise<void> {
  const state = createState();
  await renderWithState(state, 'context-menu');
  const addSection = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find(
    (button) =>
      button.textContent === translate('settings.appearance.contextMenuCreateSection', 'ru')
  );
  await act(async () => addSection?.click());
  const name = container?.querySelector<HTMLInputElement>(
    `[aria-label="${translate('settings.appearance.contextMenuSectionName', 'ru')}"]`
  );
  expect(name).toBeTruthy();
  await act(async () => {
    if (name) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        name,
        'My menu'
      );
      name.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  const menuSelect = container?.querySelector<HTMLButtonElement>('[aria-controls]');
  await act(async () => menuSelect?.click());
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();

  await renderWithState(state, 'interface');
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement?.getAttribute('aria-current')).toBe('page');
  expect(state.updateContextMenu).not.toHaveBeenCalled();

  await renderWithState(state, 'context-menu');
  expect(container?.textContent).toContain('My menu');
}

async function verifyHiddenSave(): Promise<void> {
  let rejectWrite: ((error: Error) => void) | undefined;
  const updateContextMenu = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectWrite = reject;
        })
    )
    .mockResolvedValue(undefined);
  const state = createState({ updateContextMenu });
  await renderWithState(state, 'context-menu');
  const clickText = async (label: string) => {
    const button = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (entry) => entry.textContent === label
    );
    await act(async () => {
      button?.focus();
      button?.click();
    });
  };
  await clickText(translate('settings.appearance.contextMenuRestore', 'ru'));
  await clickText(translate('settings.appearance.contextMenuSave', 'ru'));
  expect(updateContextMenu).toHaveBeenCalledTimes(1);
  await renderWithState(state, 'interface');
  await act(async () => rejectWrite?.(new Error('write failed')));
  expect(document.activeElement?.getAttribute('aria-current')).toBe('page');
  await renderWithState(state, 'context-menu');
  expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
    translate('settings.appearance.contextMenuSaveFailed', 'ru')
  );
  await clickText(translate('settings.appearance.contextMenuSave', 'ru'));
  expect(updateContextMenu).toHaveBeenCalledTimes(2);
  expect(updateContextMenu).toHaveBeenLastCalledWith({
    layout: expect.objectContaining({ version: 2 }),
  });
}
