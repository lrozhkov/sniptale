// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const switchRowProps = vi.hoisted(() => vi.fn());

vi.mock('./switch-row', () => ({
  AppearanceSwitchRow: (props: { disabled?: boolean; label: string; onToggle: () => void }) => {
    switchRowProps(props);
    return <div>{props.label}</div>;
  },
}));

import { buildAppearanceContextMenuOptions } from '../copy';
import { ContextMenuControls } from './context-menu-controls';
import type { AppearanceSectionState } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  switchRowProps.mockReset();
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
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: false,
    contextMenu: {
      enabled: false,
      showExport: true,
      showGallery: true,
      showImageEditor: true,
      showPageLinkCopy: true,
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
    rawDiagnosticsEnabled: false,
    resolvedTheme: 'light',
    setLanguagePreference: vi.fn(),
    setPreference: vi.fn(),
    themeOptions: [
      { description: 'Системная', label: 'Системная', value: 'system' },
      { description: 'Светлая', label: 'Светлая', value: 'light' },
      { description: 'Тёмная', label: 'Тёмная', value: 'dark' },
    ],
    updateAnonymousCrossOriginSnapshotAssetsEnabled: vi.fn().mockResolvedValue(undefined),
    updateAuthenticatedSnapshotAssetsEnabled: vi.fn().mockResolvedValue(undefined),
    updateContextMenu,
    updateRawDiagnosticsEnabled: vi.fn().mockResolvedValue(undefined),
  };
}

it('keeps item mutations guarded when the context menu owner is disabled', async () => {
  const updateContextMenu = vi.fn().mockResolvedValue(undefined);
  const state = createAppearanceState(updateContextMenu);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => root?.render(<ContextMenuControls state={state} />));

  const itemProps = switchRowProps.mock.calls[1]?.[0] as {
    disabled: boolean;
    onToggle: () => void;
  };
  expect(itemProps.disabled).toBe(true);
  itemProps.onToggle();
  expect(updateContextMenu).not.toHaveBeenCalled();

  const ownerProps = switchRowProps.mock.calls[0]?.[0] as { onToggle: () => void };
  ownerProps.onToggle();
  expect(updateContextMenu).toHaveBeenCalledWith({ enabled: true });
});
