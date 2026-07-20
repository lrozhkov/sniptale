// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PopupCommandPaletteRuntime } from '../runtime/types/command-palette';
import { createPopupAppShellRuntime } from '../app-shell/test-support/runtime';

const mocks = vi.hoisted(() => ({
  buildActionsMock: vi.fn(),
  commandPaletteMock: vi.fn(),
}));

vi.mock('../../../ui/command-palette', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/command-palette')>()),
  CommandPalette: (props: unknown) => {
    mocks.commandPaletteMock(props);
    return <div data-testid="popup-command-palette" />;
  },
}));

vi.mock('./actions', () => ({
  buildPopupCommandPaletteActions: (...args: unknown[]) => mocks.buildActionsMock(...args),
}));

import PopupCommandPalette from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function createCommandPaletteRuntime(): PopupCommandPaletteRuntime {
  return createPopupAppShellRuntime({ galleryStatus: null });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.buildActionsMock.mockReset();
  mocks.commandPaletteMock.mockReset();
  mocks.buildActionsMock.mockReturnValue([{ id: 'action-1' }]);
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

describe('PopupCommandPalette', () => {
  it('builds popup actions and passes them to the shared command palette', () => {
    const runtime = createCommandPaletteRuntime();
    const onClose = vi.fn();

    renderNode(<PopupCommandPalette isOpen onClose={onClose} runtime={runtime} />);

    expect(mocks.buildActionsMock).toHaveBeenCalledWith(runtime);
    expect(mocks.commandPaletteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: [{ id: 'action-1' }],
        dataUi: 'popup.command-palette',
        isOpen: true,
        onClose,
        storageKey: 'sniptale.popup.command-palette',
      })
    );
  });
});
