// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  bindingsPropsMock,
  commandPalettePropsMock,
  galleryControllerMock,
  useCommandPaletteHotkeyMock,
  useGalleryAppStateMock,
} = vi.hoisted(() => ({
  bindingsPropsMock: vi.fn(),
  commandPalettePropsMock: vi.fn(),
  galleryControllerMock: {
    actions: {
      storage: {
        refresh: vi.fn(async () => undefined),
      },
    },
    id: 'controller',
    state: {
      filters: {
        search: '',
        sortMode: 'newest',
      },
    },
  },
  useCommandPaletteHotkeyMock: vi.fn(),
  useGalleryAppStateMock: vi.fn(() => ({
    actions: galleryControllerMock.actions,
    id: 'controller',
    state: galleryControllerMock.state,
  })),
}));

vi.mock('../../../ui/command-palette/hotkey', () => ({
  useCommandPaletteHotkey: useCommandPaletteHotkeyMock,
}));

vi.mock('./bindings', () => ({
  GalleryAppBindings: (props: unknown) => {
    bindingsPropsMock(props);
    return <div data-ui="test.bindings" />;
  },
}));

vi.mock('../command-palette', () => ({
  GalleryCommandPalette: (props: { isOpen: boolean }) => {
    commandPalettePropsMock(props);
    return <div data-ui="test.command-palette">{props.isOpen ? 'open' : 'closed'}</div>;
  },
}));

vi.mock('../../state', () => ({
  useGalleryAppState: useGalleryAppStateMock,
}));

vi.mock('../../library/actions/useGalleryAppActions', () => ({
  useGalleryAppActions: () => ({ id: 'actions' }),
}));

import { GalleryApp } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  vi.unstubAllGlobals();
});

describe('GalleryApp', () => {
  it('wires controller, actions, and command-palette hotkeys', () => {
    act(() => {
      root?.render(<GalleryApp />);
    });

    expect(bindingsPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        controller: expect.objectContaining({ id: 'controller' }),
        actions: { id: 'actions' },
        onRefreshAll: expect.any(Function),
        setViewMode: expect.any(Function),
        viewMode: 'compact-grid',
      })
    );
    expect(useGalleryAppStateMock).toHaveBeenCalledWith('compact-grid');
    expect(commandPalettePropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false, onRefresh: expect.any(Function) })
    );

    const hotkeyArgs = useCommandPaletteHotkeyMock.mock.calls[0]?.[0];
    if (!hotkeyArgs) {
      throw new Error('Expected hotkey args');
    }

    act(() => {
      hotkeyArgs.onOpen();
    });
    expect(commandPalettePropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true })
    );

    act(() => {
      hotkeyArgs.onClose();
    });
    expect(commandPalettePropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false })
    );
  });
});
