// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './index';
import type { CommandPaletteAction, LocalizedCommandPaletteGroup } from './types';

type SurfaceProps = {
  isOpen: boolean;
  dataUi: string;
  titleId: string;
  title: string;
  actionError: string | null;
  query: string;
  inputRef: { current: HTMLInputElement | null };
  flatActions: readonly CommandPaletteAction[];
  groups: LocalizedCommandPaletteGroup[];
  flatActionIds: readonly string[];
  selectedIndex: number;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onHoverAction: (actionId: string) => void;
  onSelectAction: (action: CommandPaletteAction) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

const mocks = vi.hoisted(() => {
  const primaryAction: CommandPaletteAction = {
    id: 'open-settings',
    onSelect: vi.fn(),
    title: 'Open settings',
  };
  const secondaryAction: CommandPaletteAction = {
    id: 'open-gallery',
    onSelect: vi.fn(),
    title: 'Open gallery',
  };

  return {
    handleKeyDownMock: vi.fn(),
    handleSelectActionMock: vi.fn().mockResolvedValue(undefined),
    primaryAction,
    secondaryAction,
    setQueryMock: vi.fn(),
    setRecentActionIdsMock: vi.fn(),
    setSelectedIndexMock: vi.fn(),
    surfaceSpy: vi.fn(),
    useCommandPaletteControllerMock: vi.fn(),
    useCommandPaletteKeyDownMock: vi.fn(),
    useCommandPaletteSelectActionMock: vi.fn(),
  };
});

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => `t:${key}`,
}));

vi.mock('./controller', () => ({
  useCommandPaletteController: mocks.useCommandPaletteControllerMock,
  useCommandPaletteKeyDown: mocks.useCommandPaletteKeyDownMock,
  useCommandPaletteSelectAction: mocks.useCommandPaletteSelectActionMock,
}));

vi.mock('./views', () => ({
  CommandPaletteSurface: (props: SurfaceProps) => {
    mocks.surfaceSpy(props);

    return (
      <div data-testid="command-palette-surface" data-ui={props.dataUi} onKeyDown={props.onKeyDown}>
        <span data-testid="palette-title">{props.title}</span>
        <span data-testid="palette-error">{props.actionError}</span>
        <span data-testid="group-label">{props.groups[0]?.label ?? ''}</span>
        <button
          type="button"
          data-testid="hover-action"
          onClick={() => props.onHoverAction(mocks.secondaryAction.id)}
        />
        <button
          type="button"
          data-testid="select-action"
          onClick={() => props.onSelectAction(mocks.primaryAction)}
        />
      </div>
    );
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPalette(props: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <CommandPalette
        isOpen
        actions={[mocks.primaryAction, mocks.secondaryAction]}
        onClose={() => undefined}
        storageKey="palette-key"
        {...props}
      />
    );
  });
}

function expectControllerHooksCalled(onClose: () => void) {
  expect(mocks.useCommandPaletteControllerMock).toHaveBeenCalledWith(
    [mocks.primaryAction, mocks.secondaryAction],
    true,
    'palette-key'
  );
  expect(mocks.useCommandPaletteSelectActionMock).toHaveBeenCalledWith({
    onClose,
    recentActionIds: [mocks.primaryAction.id],
    setRecentActionIds: mocks.setRecentActionIdsMock,
    storageKey: 'palette-key',
  });
  expect(mocks.useCommandPaletteKeyDownMock).toHaveBeenCalledWith({
    flatActions: [mocks.primaryAction, mocks.secondaryAction],
    onClose,
    onSelectAction: expect.any(Function),
    selectedIndex: 0,
    setSelectedIndex: mocks.setSelectedIndexMock,
  });
}

function expectTranslatedSurface(surface: HTMLDivElement | null | undefined) {
  expect(surface?.dataset['ui']).toBe('shared.ui.command-palette');
  expect(container?.querySelector('[data-testid="palette-title"]')?.textContent).toBe(
    't:shared.ui.commandPaletteTitle'
  );
  expect(container?.querySelector('[data-testid="group-label"]')?.textContent).toBe(
    't:shared.ui.commandPaletteRecentSection'
  );
}

function triggerSurfaceCallbacks(surface: HTMLDivElement | null | undefined) {
  act(() => {
    container?.querySelector<HTMLButtonElement>('[data-testid="hover-action"]')?.click();
    container?.querySelector<HTMLButtonElement>('[data-testid="select-action"]')?.click();
    surface?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.handleKeyDownMock.mockReset();
  mocks.handleSelectActionMock.mockReset();
  mocks.handleSelectActionMock.mockResolvedValue(undefined);
  mocks.setQueryMock.mockReset();
  mocks.setRecentActionIdsMock.mockReset();
  mocks.setSelectedIndexMock.mockReset();
  mocks.surfaceSpy.mockReset();
  mocks.useCommandPaletteControllerMock.mockReset();
  mocks.useCommandPaletteKeyDownMock.mockReset();
  mocks.useCommandPaletteSelectActionMock.mockReset();
  mocks.useCommandPaletteControllerMock.mockReturnValue({
    flatActionIds: [mocks.primaryAction.id, mocks.secondaryAction.id],
    flatActions: [mocks.primaryAction, mocks.secondaryAction],
    groups: [
      {
        id: 'recent',
        label: 'shared.ui.commandPaletteRecentSection',
        actions: [mocks.primaryAction],
      },
    ],
    inputRef: { current: null },
    query: 'open',
    recentActionIds: [mocks.primaryAction.id],
    selectedIndex: 0,
    setQuery: mocks.setQueryMock,
    setRecentActionIds: mocks.setRecentActionIdsMock,
    setSelectedIndex: mocks.setSelectedIndexMock,
  });
  mocks.useCommandPaletteSelectActionMock.mockReturnValue(mocks.handleSelectActionMock);
  mocks.useCommandPaletteKeyDownMock.mockReturnValue(mocks.handleKeyDownMock);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CommandPalette', () => {
  it('passes translated controller state into the surface and wires callbacks', () => {
    const onClose = vi.fn();

    renderPalette({ onClose });

    const surface = container?.querySelector<HTMLDivElement>(
      '[data-testid="command-palette-surface"]'
    );

    expectControllerHooksCalled(onClose);
    expectTranslatedSurface(surface);
    triggerSurfaceCallbacks(surface);

    expect(mocks.setSelectedIndexMock).toHaveBeenCalledWith(1);
    expect(mocks.handleSelectActionMock).toHaveBeenCalledWith(mocks.primaryAction);
    expect(mocks.handleKeyDownMock).toHaveBeenCalledTimes(1);
  });

  it('honors an explicit data-ui override', () => {
    renderPalette({ dataUi: 'custom.palette' });

    expect(
      container?.querySelector('[data-testid="command-palette-surface"]')?.getAttribute('data-ui')
    ).toBe('custom.palette');
  });

  it('reports failed action selection without closing the error in the wrapper', async () => {
    const onActionError = vi.fn();
    const onActionStart = vi.fn();
    const failure = new Error('clipboard failed');
    mocks.handleSelectActionMock.mockRejectedValueOnce(failure);

    renderPalette({ actionError: 'Previous error', onActionError, onActionStart });

    act(() => {
      container?.querySelector<HTMLButtonElement>('[data-testid="select-action"]')?.click();
    });
    await act(async () => Promise.resolve());

    expect(onActionStart).toHaveBeenCalledWith(mocks.primaryAction);
    expect(onActionError).toHaveBeenCalledWith(mocks.primaryAction, failure);
    expect(container?.querySelector('[data-testid="palette-error"]')?.textContent).toBe(
      'Previous error'
    );
  });
});
