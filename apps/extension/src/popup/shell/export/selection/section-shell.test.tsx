// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => `t:${key}`,
}));

import { ExportSelectionSectionShell } from './section-shell';

type ShellProps = ComponentProps<typeof ExportSelectionSectionShell>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderShell(overrides: Partial<ShellProps> = {}) {
  const props: ShellProps = {
    children: <div data-testid="drawer-child">content</div>,
    drawerDescription: 'Choose export options',
    drawerLabel: 'Export options',
    isOpen: false,
    onClose: vi.fn(),
    onOpen: vi.fn(),
    title: 'Selection',
    ...overrides,
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<ExportSelectionSectionShell {...props} />);
  });

  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ExportSelectionSectionShell', () => {
  it('renders the closed shell and delegates opening', async () => {
    const props = await renderShell({ bodyClassName: 'drawer-body', className: 'owner-shell' });
    const button = container?.querySelector('button') as HTMLButtonElement;
    const drawer = container?.querySelector('[aria-label="Export options"]');
    const heading = container?.querySelector<HTMLElement>(
      '[data-ui="popup.export.selection-heading"]'
    );

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(heading?.className).toContain('text-[10px]');
    expect(heading?.className).toContain('font-semibold');
    expect(heading?.className).toContain('tracking-[0.08em]');
    expect(heading?.className).toContain('var(--sniptale-color-text-muted-strong)');
    expect(button.getAttribute('data-ui')).toBe('popup.export.selection-trigger');
    expect(button.textContent).not.toContain('t:popup.export.editButton');
    expect(button.querySelector('svg')?.className.baseVal).toContain('group-hover:opacity-100');
    expect(drawer?.className).toContain('drawer-body');
    expect(container?.querySelector('section')?.className).toContain('owner-shell');

    await act(async () => button.click());
    expect(props.onOpen).toHaveBeenCalledOnce();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('closes from the action, Escape, and outside pointer events only', async () => {
    const props = await renderShell({ isExpanded: true, isOpen: true });
    const button = container?.querySelector(
      '[data-ui="popup.inline-curtain.header"] button'
    ) as HTMLButtonElement;
    const child = container?.querySelector('[data-testid="drawer-child"]') as HTMLElement;

    expect(button.getAttribute('aria-label')).toBe('t:popup.export.backButton');
    const curtain = container?.querySelector('[data-ui="popup.export.selection-curtain"]');
    expect(curtain?.className).toContain('!w-[90%]');
    expect(curtain?.textContent).toContain('Choose export options');
    expect(curtain?.getAttribute('aria-modal')).toBe('true');
    await act(async () => Promise.resolve());
    expect(document.activeElement).toBe(button);

    await act(async () => button.click());
    child.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    const escapeEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });
    document.dispatchEvent(escapeEvent);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(props.onClose).toHaveBeenCalledTimes(3);

    await act(async () => {
      root?.render(<ExportSelectionSectionShell {...props} isOpen={false} />);
      await Promise.resolve();
    });
    expect(document.activeElement?.getAttribute('data-ui')).toBe('popup.export.selection-trigger');
  });

  it('keeps keyboard focus inside the open curtain', async () => {
    await renderShell({
      children: (
        <>
          <button type="button">Middle</button>
          <button type="button" data-testid="last-action">
            Last
          </button>
        </>
      ),
      isOpen: true,
    });
    await act(async () => Promise.resolve());
    const back = container?.querySelector(
      '[data-ui="popup.inline-curtain.header"] button'
    ) as HTMLButtonElement;
    const last = container?.querySelector('[data-testid="last-action"]') as HTMLButtonElement;

    const backwards = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
      shiftKey: true,
    });
    document.dispatchEvent(backwards);
    expect(backwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    const forwards = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    document.dispatchEvent(forwards);
    expect(forwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(back);
  });
});
