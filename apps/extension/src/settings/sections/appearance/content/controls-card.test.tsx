// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contextMenu: vi.fn(() => <div data-ui="context-menu" />),
  switchRow: vi.fn(),
  themeChips: vi.fn(() => <div data-ui="theme-chips" />),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
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
vi.mock('./switch-row', () => ({
  AppearanceSwitchRow: (props: { checked: boolean; label: string; onToggle: () => void }) => {
    mocks.switchRow(props);
    return (
      <button
        type="button"
        aria-label={props.label}
        aria-pressed={props.checked}
        onClick={props.onToggle}
      />
    );
  },
}));

import { AppearanceControlsCard } from './controls-card';
import {
  buildAppearanceContextMenuOptions,
  buildAppearanceLocaleOptions,
  buildAppearanceThemeOptions,
} from '../copy';
import type { AppearanceSectionState } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(overrides: Partial<AppearanceSectionState> = {}): AppearanceSectionState {
  return {
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: false,
    contextMenu: {
      enabled: true,
      showExport: true,
      showGallery: true,
      showImageEditor: true,
      showPageLinkCopy: true,
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
    rawDiagnosticsEnabled: false,
    resolvedTheme: 'light',
    setLanguagePreference: vi.fn(),
    setPreference: vi.fn(),
    themeOptions: buildAppearanceThemeOptions('en'),
    updateAnonymousCrossOriginSnapshotAssetsEnabled: vi.fn().mockResolvedValue(undefined),
    updateAuthenticatedSnapshotAssetsEnabled: vi.fn().mockResolvedValue(undefined),
    updateContextMenu: vi.fn().mockResolvedValue(undefined),
    updateRawDiagnosticsEnabled: vi.fn().mockResolvedValue(undefined),
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

it('renders appearance owners and routes locale and privacy controls', () => {
  const state = createState();
  renderCard(state);

  expect(container?.querySelector('[data-ui="theme-chips"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="context-menu"]')).not.toBeNull();
  expect(container?.textContent).not.toContain(
    'settings.appearance.authenticatedSnapshotAssetsWarning'
  );

  const authToggle = container?.querySelector<HTMLButtonElement>(
    '[aria-label="settings.appearance.authenticatedSnapshotAssetsLabel"]'
  );
  const anonymousToggle = container?.querySelector<HTMLButtonElement>(
    '[aria-label="settings.appearance.anonymousCrossOriginSnapshotAssetsLabel"]'
  );
  act(() => {
    authToggle?.click();
    anonymousToggle?.click();
  });
  expect(state.updateAuthenticatedSnapshotAssetsEnabled).toHaveBeenCalledWith(true);
  expect(state.updateAnonymousCrossOriginSnapshotAssetsEnabled).toHaveBeenCalledWith(false);

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
  expect(mocks.themeChips).toHaveBeenCalledWith(expect.objectContaining({ state }), undefined);
  expect(mocks.contextMenu).toHaveBeenCalledWith(expect.objectContaining({ state }), undefined);
});

it('shows the authenticated snapshot warning and toggles it off', () => {
  const state = createState({ authenticatedSnapshotAssetsEnabled: true });
  renderCard(state);

  expect(container?.textContent).toContain(
    'settings.appearance.authenticatedSnapshotAssetsWarning'
  );
  act(() =>
    container
      ?.querySelector<HTMLButtonElement>(
        '[aria-label="settings.appearance.authenticatedSnapshotAssetsLabel"]'
      )
      ?.click()
  );
  expect(state.updateAuthenticatedSnapshotAssetsEnabled).toHaveBeenCalledWith(false);
});
