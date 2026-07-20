// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useCommandPaletteHotkeyMock } = vi.hoisted(() => ({
  useCommandPaletteHotkeyMock: vi.fn(),
}));
const { buildDesignSystemVariantPreviewMapMock } = vi.hoisted(() => ({
  buildDesignSystemVariantPreviewMapMock: vi.fn(() => new Map([['entry.default', <div />]])),
}));
const { useDesignSystemThemeSurfaceMock } = vi.hoisted(() => ({
  useDesignSystemThemeSurfaceMock: vi.fn(() => ({
    previewTheme: 'dark',
    setPreviewTheme: vi.fn(),
  })),
}));
const { useDesignSystemPageStateMock } = vi.hoisted(() => ({
  useDesignSystemPageStateMock: vi.fn(() => ({ filteredEntriesCount: 1 })),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) =>
    key === 'designSystem.page.documentTitle' ? 'Sniptale Design System' : key,
  useAppLocale: () => 'en',
}));

vi.mock('../../../ui/command-palette/hotkey', () => ({
  useCommandPaletteHotkey: useCommandPaletteHotkeyMock,
}));

vi.mock('../../previews', () => ({
  buildDesignSystemVariantPreviewMap: buildDesignSystemVariantPreviewMapMock,
}));

vi.mock('../../theme', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../theme')>()),
  useDesignSystemThemeSurface: useDesignSystemThemeSurfaceMock,
}));

vi.mock('./state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state')>()),
  useDesignSystemPageState: useDesignSystemPageStateMock,
}));

vi.mock('./app-shell', () => ({
  DesignSystemAppShell: () => <div data-testid="app-shell" />,
}));

vi.mock('../command-palette', () => ({
  DesignSystemCommandPalette: () => <div data-testid="command-palette" />,
}));

import { DesignSystemPage } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

describe('DesignSystemPage', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    document.title = '';
  });

  it('sets the document title and wires the app shell plus command palette through the page owner', async () => {
    await act(async () => {
      root?.render(<DesignSystemPage />);
    });

    expect(document.title).toBe('Sniptale Design System');
    expect(buildDesignSystemVariantPreviewMapMock).toHaveBeenCalledWith('en');
    expect(useDesignSystemPageStateMock).toHaveBeenCalledWith('en');
    expect(useCommandPaletteHotkeyMock).toHaveBeenCalledOnce();
    expect(container?.querySelector('[data-testid="app-shell"]')).not.toBeNull();
    expect(container?.querySelector('[data-testid="command-palette"]')).not.toBeNull();
  });
});
