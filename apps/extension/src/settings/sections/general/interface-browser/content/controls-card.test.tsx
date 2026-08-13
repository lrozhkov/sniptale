// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contextMenu: vi.fn(() => <div data-ui="context-menu" />),
  themeChips: vi.fn(() => <div data-ui="theme-chips" />),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/ui/product-form-controls', () => ({
  ProductSelect: (props: {
    'aria-label': string;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => (
    <select
      aria-label={props['aria-label']}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('./context-menu-controls', () => ({
  ContextMenuControls: mocks.contextMenu,
}));
vi.mock('./theme-chips', () => ({
  ThemeChips: mocks.themeChips,
}));
import { AppearanceControlsCard } from './controls-card';
import {
  buildAppearanceContextMenuOptions,
  buildAppearanceLocaleOptions,
  buildAppearanceThemeOptions,
  buildPopupStartupOptions,
} from '../copy';
import type { AppearanceSectionState } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(overrides: Partial<AppearanceSectionState> = {}): AppearanceSectionState {
  return {
    contextMenu: {
      enabled: true,
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
    contextMenuOptions: buildAppearanceContextMenuOptions('en'),
    languagePreference: 'ru',
    locale: 'en',
    localeOptions: buildAppearanceLocaleOptions('en'),
    preference: 'system',
    popupStartup: {
      loading: false,
      options: buildPopupStartupOptions('en'),
      selection: 'remember-last',
      updateSelection: vi.fn().mockResolvedValue(undefined),
    },
    resolvedTheme: 'light',
    setLanguagePreference: vi.fn(),
    setPreference: vi.fn(),
    themeOptions: buildAppearanceThemeOptions('en'),
    updateContextMenu: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderCard(state: AppearanceSectionState): void {
  container ??= document.createElement('div');
  root ??= createRoot(container);
  act(() => root?.render(<AppearanceControlsCard state={state} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('renders appearance owners and routes locale controls', () => {
  const state = createState();
  renderCard(state);

  expect(container?.querySelector('[data-ui="theme-chips"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="context-menu"]')).not.toBeNull();
  expect(container?.firstElementChild?.className).not.toContain('divide-y');
  expect(container?.firstElementChild?.className).not.toContain('rounded');

  const select = container?.querySelector<HTMLSelectElement>(
    '[aria-label="settings.appearance.languageSelectAriaLabel"]'
  );
  act(() => {
    if (select) {
      select.value = 'en';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  expect(state.setLanguagePreference).toHaveBeenCalledWith('en');

  const startupSelect = container?.querySelector<HTMLSelectElement>(
    '[aria-label="settings.appearance.popupStartupAriaLabel"]'
  );
  act(() => {
    if (startupSelect) {
      startupSelect.value = 'video:screen';
      startupSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  expect(state.popupStartup.updateSelection).toHaveBeenCalledWith('video:screen');
  expect(mocks.themeChips).toHaveBeenCalledWith(expect.objectContaining({ state }), undefined);
  expect(mocks.contextMenu).toHaveBeenCalledWith(expect.objectContaining({ state }), undefined);
});
