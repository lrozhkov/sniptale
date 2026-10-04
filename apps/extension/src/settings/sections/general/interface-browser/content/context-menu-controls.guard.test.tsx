// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { buildAppearanceContextMenuOptions, buildPopupStartupOptions } from '../copy';
import { ContextMenuControls } from './context-menu-controls';
import type { AppearanceSectionState } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function createAppearanceState(
  updateContextMenu: AppearanceSectionState['updateContextMenu']
): AppearanceSectionState {
  return {
    contextMenu: {
      enabled: false,
      showExport: true,
      showGallery: true,
      showImageEditor: true,
      showPageLinkCopy: true,
      showWindowResize: true,
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
      { description: 'Системная', label: 'Системная', value: 'system' },
      { description: 'Светлая', label: 'Светлая', value: 'light' },
      { description: 'Тёмная', label: 'Тёмная', value: 'dark' },
    ],
    updateContextMenu,
  };
}

it('keeps the global menu disabled while allowing a saved tree draft', async () => {
  const updateContextMenu = vi.fn().mockResolvedValue(undefined);
  const state = createAppearanceState(updateContextMenu);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => root?.render(<ContextMenuControls state={state} />));

  expect(container?.querySelector('[role="tree"]')).toBeTruthy();
  expect(updateContextMenu).not.toHaveBeenCalled();

  const ownerToggle = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Показывать меню Sniptale"]'
  );
  ownerToggle?.click();
  expect(updateContextMenu).toHaveBeenCalledWith({ enabled: true });
});
