// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAppearanceContextMenuOptions } from '../copy';
import { ContextMenuControls } from './context-menu-controls';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState() {
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
    locale: 'ru',
    updateContextMenu: vi.fn().mockResolvedValue(undefined),
  };
}

async function renderWithState(state: ReturnType<typeof createState>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ContextMenuControls state={state as never} />);
  });
}

describe('ContextMenuControls', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
  });

  it('renders one command tree and routes the global switch', async () => {
    const state = createState();
    await renderWithState(state);
    expect(container?.textContent).toContain('Контекстное меню браузера');
    expect(container?.querySelector('[role="tree"]')).toBeTruthy();
    expect(container?.textContent).toContain('Каталог команд');
    expect(container?.textContent).toContain('Предпросмотр меню');
    const ownerToggle = container?.querySelector<HTMLButtonElement>(
      'button[aria-label="Показывать меню Sniptale"]'
    );
    await act(async () => ownerToggle?.click());
    expect(state.updateContextMenu).toHaveBeenCalledWith({ enabled: false });
  });
});
