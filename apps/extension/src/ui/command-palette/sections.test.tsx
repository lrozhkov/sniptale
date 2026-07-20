// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandPaletteAction, LocalizedCommandPaletteGroup } from './types';
import { CommandPaletteBody, CommandPaletteHeader, CommandPaletteTitle } from './sections';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
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

function createBodyFixture() {
  const activeAction = createAction('open-settings', {
    icon: <span data-testid="custom-icon">S</span>,
    section: 'Navigation',
    shortcut: 'Ctrl+,',
    subtitle: 'Open settings page',
    title: 'Open settings',
  });
  const disabledAction = createAction('open-gallery', {
    disabled: true,
    disabledReason: 'Unavailable on this page',
    title: 'Open gallery',
  });
  const groups: LocalizedCommandPaletteGroup[] = [
    {
      id: 'empty',
      label: 'Empty group',
      actions: [],
    },
    {
      id: 'main',
      label: 'Main actions',
      actions: [activeAction, disabledAction],
    },
  ];

  return {
    activeAction,
    disabledAction,
    groups,
  };
}

function getOptionButtons() {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []);
}

function expectRenderedBodyRows(optionButtons: HTMLButtonElement[]) {
  expect(container?.textContent).toContain('Main actions');
  expect(container?.textContent).not.toContain('Empty group');
  expect(optionButtons).toHaveLength(2);
  expect(optionButtons[0]?.getAttribute('aria-selected')).toBe('true');
  expect(optionButtons[0]?.dataset['selected']).toBe('true');
  expect(optionButtons[1]?.dataset['selected']).toBe('false');
  expect(optionButtons[0]?.textContent).toContain('Navigation');
  expect(optionButtons[0]?.textContent).toContain('Open settings page');
  expect(optionButtons[0]?.textContent).toContain('Ctrl+,');
  expect(optionButtons[1]?.disabled).toBe(true);
  expect(optionButtons[1]?.textContent).toContain('Unavailable on this page');
  expect(optionButtons[1]?.querySelector('svg')).not.toBeNull();
  expect(optionButtons[0]?.querySelector('[data-testid="custom-icon"]')).not.toBeNull();
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

describe('CommandPaletteHeader', () => {
  it('renders the query, propagates changes and closes the palette', () => {
    const onClose = vi.fn();
    const onQueryChange = vi.fn();
    const inputRef = { current: null as HTMLInputElement | null };

    renderNode(
      <CommandPaletteHeader
        query="open"
        inputRef={inputRef}
        onClose={onClose}
        onQueryChange={onQueryChange}
      />
    );

    const input = container?.querySelector('input');
    const closeButton = container?.querySelector('button');

    expect(input?.value).toBe('open');
    expect(input?.getAttribute('placeholder')).toBe('t:shared.ui.commandPalettePlaceholder');
    expect(closeButton?.getAttribute('title')).toBe('t:shared.ui.commandPaletteCloseTitle');

    act(() => {
      if (input) {
        changeTextInput(input, 'gallery');
      }
      closeButton?.click();
    });

    expect(onQueryChange).toHaveBeenCalledWith('gallery');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(inputRef.current).toBe(input);
  });
});

describe('CommandPaletteBody', () => {
  it('renders the empty state when there are no actions', () => {
    renderNode(
      <CommandPaletteBody
        title="Palette title"
        groups={[]}
        flatActions={[]}
        flatActionIds={[]}
        selectedIndex={0}
        onHoverAction={() => undefined}
        onSelectAction={() => undefined}
      />
    );

    const listbox = container?.querySelector('[role="listbox"]');

    expect(listbox?.getAttribute('aria-label')).toBe('Palette title');
    expect(container?.textContent).toContain('t:shared.ui.commandPaletteEmptyTitle');
    expect(container?.textContent).toContain('t:shared.ui.commandPaletteEmptyDescription');
  });
});

describe('CommandPaletteBody interactions', () => {
  it('renders only non-empty groups and wires hover/select interactions', () => {
    const onHoverAction = vi.fn();
    const onSelectAction = vi.fn();
    const { activeAction, disabledAction, groups } = createBodyFixture();

    renderNode(
      <CommandPaletteBody
        title="Palette title"
        groups={groups}
        flatActions={[activeAction, disabledAction]}
        flatActionIds={['open-settings', 'open-gallery']}
        selectedIndex={0}
        onHoverAction={onHoverAction}
        onSelectAction={onSelectAction}
      />
    );

    const optionButtons = getOptionButtons();

    expectRenderedBodyRows(optionButtons);

    act(() => {
      optionButtons[0]?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      optionButtons[0]?.click();
    });

    expect(onHoverAction).toHaveBeenCalledWith('open-settings');
    expect(onSelectAction).toHaveBeenCalledWith(activeAction);
  });
});

describe('CommandPaletteTitle', () => {
  it('renders a hidden title element for dialog labelling', () => {
    renderNode(<CommandPaletteTitle titleId="palette-title" title="Palette title" />);

    const title = container?.querySelector('h2');

    expect(title?.id).toBe('palette-title');
    expect(title?.className).toContain('sr-only');
    expect(title?.textContent).toBe('Palette title');
  });
});
