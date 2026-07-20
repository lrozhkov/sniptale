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
      showImageEditor: true,
      showScreenshots: true,
      showSettings: true,
      showVideo: true,
      showVideoEditor: true,
    },
    contextMenuOptions: buildAppearanceContextMenuOptions('ru'),
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

  it('renders context menu toggles and forwards item updates', async () => {
    const state = createState();

    await renderWithState(state);

    expect(container?.textContent).toContain('Встраивание в контекстное меню');
    expect(container?.textContent).toContain('Копировать название и ссылку');
    expect(container?.querySelector('button[aria-label="Настройки"]')).toBeTruthy();

    const pageLinkToggle = container?.querySelector(
      'button[aria-label="Копировать название и ссылку"]'
    ) as HTMLButtonElement;

    await act(async () => {
      pageLinkToggle.click();
    });

    expect(state.updateContextMenu).toHaveBeenCalledWith({ showPageLinkCopy: false });
  });
});
