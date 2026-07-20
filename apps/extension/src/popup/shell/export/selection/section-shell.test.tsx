// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { ExportSelectionSectionShell } from './section-shell';

type ShellProps = ComponentProps<typeof ExportSelectionSectionShell>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderShell(overrides: Partial<ShellProps> = {}) {
  const props: ShellProps = {
    children: <div data-testid="drawer-child">content</div>,
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

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(drawer?.className).toContain('drawer-body');
    expect(container?.querySelector('section')?.className).toContain('owner-shell');

    await act(async () => button.click());
    expect(props.onOpen).toHaveBeenCalledOnce();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('closes from the action, Escape, and outside pointer events only', async () => {
    const props = await renderShell({ isExpanded: true, isOpen: true });
    const button = container?.querySelector('button') as HTMLButtonElement;
    const child = container?.querySelector('[data-testid="drawer-child"]') as HTMLElement;

    expect(button.textContent).toBe('t:popup.export.doneButton');
    expect(container?.querySelector('section')?.className).toContain('flex-1');

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
  });
});
