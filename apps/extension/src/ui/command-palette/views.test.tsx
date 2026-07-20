// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CommandPaletteAction } from './types';
import { CommandPaletteSurface } from './views';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createAction(
  id: string,
  overrides: Partial<CommandPaletteAction> = {}
): CommandPaletteAction {
  return {
    id,
    onSelect: () => undefined,
    title: id,
    ...overrides,
  };
}

function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(node);
  });
}

function changeTextInput(input: HTMLInputElement, nextValue: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  valueSetter?.call(input, nextValue);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderSurfaceFixture() {
  const inputRef = { current: null as HTMLInputElement | null };
  const action = createAction('open-settings', {
    section: 'Navigation',
    subtitle: 'Open settings page',
    title: 'Open settings',
  });
  const onClose = vi.fn();
  const onHoverAction = vi.fn();
  const onSelectAction = vi.fn();
  const onQueryChange = vi.fn();
  const onKeyDown = vi.fn();

  renderNode(
    <CommandPaletteSurface
      isOpen
      dataUi="shared.ui.command-palette"
      titleId="palette-title"
      title="Palette title"
      actionError={null}
      query="open"
      inputRef={inputRef}
      flatActions={[action]}
      groups={[{ actions: [action], id: 'main', label: 'Main actions' }]}
      flatActionIds={[action.id]}
      selectedIndex={0}
      onClose={onClose}
      onQueryChange={onQueryChange}
      onHoverAction={onHoverAction}
      onSelectAction={onSelectAction}
      onKeyDown={onKeyDown}
    />
  );

  return {
    action,
    closeButton: Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.getAttribute('role') !== 'option'
    ),
    dialog: container?.querySelector('[data-ui="shared.ui.command-palette"]'),
    input: container?.querySelector('input'),
    inputRef,
    onClose,
    onHoverAction,
    onKeyDown,
    onQueryChange,
    onSelectAction,
    optionButton: container?.querySelector<HTMLButtonElement>('button[role="option"]'),
  };
}

function interactWithSurface(fixture: ReturnType<typeof renderSurfaceFixture>) {
  act(() => {
    if (fixture.input) {
      changeTextInput(fixture.input, 'gallery');
    }
    fixture.optionButton?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    fixture.optionButton?.click();
    fixture.closeButton?.click();
    fixture.dialog?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });
}

it('wires the header, body, and forwarded input ref through the surface shell', () => {
  const fixture = renderSurfaceFixture();

  interactWithSurface(fixture);

  expect(fixture.inputRef.current).toBe(fixture.input);
  expect(container?.textContent).toContain('Main actions');
  expect(fixture.onQueryChange).toHaveBeenCalledWith('gallery');
  expect(fixture.onHoverAction).toHaveBeenCalledWith(fixture.action.id);
  expect(fixture.onSelectAction).toHaveBeenCalledWith(fixture.action);
  expect(fixture.onClose).toHaveBeenCalledTimes(1);
  expect(fixture.onKeyDown).toHaveBeenCalledTimes(1);
});

it('renders action errors inline inside the palette surface', () => {
  const inputRef = { current: null as HTMLInputElement | null };
  const action = createAction('open-settings');

  renderNode(
    <CommandPaletteSurface
      isOpen
      dataUi="shared.ui.command-palette"
      titleId="palette-title"
      title="Palette title"
      actionError="Clipboard failed"
      query=""
      inputRef={inputRef}
      flatActions={[action]}
      groups={[{ actions: [action], id: 'main', label: 'Main actions' }]}
      flatActionIds={[action.id]}
      selectedIndex={0}
      onClose={() => undefined}
      onQueryChange={() => undefined}
      onHoverAction={() => undefined}
      onSelectAction={() => undefined}
      onKeyDown={() => undefined}
    />
  );

  expect(container?.textContent).toContain('Clipboard failed');
  expect(
    container?.querySelector('[data-ui="shared.ui.command-palette.action-error"]')
  ).not.toBeNull();
});
