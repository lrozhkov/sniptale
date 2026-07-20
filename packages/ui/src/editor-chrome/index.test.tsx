// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  EditorDivider,
  EditorIconButton,
  EditorToolbarDivider,
  EditorToolbarSection,
  EditorToolbarShell,
  ValueBadge,
} from '@sniptale/ui/editor-chrome';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
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
  vi.unstubAllGlobals();
});

it('renders an interactive icon button with active state metadata', () => {
  const onClick = vi.fn();
  const onMouseDown = vi.fn();

  render(
    <EditorIconButton title="Open project" active onMouseDown={onMouseDown} onClick={onClick}>
      <span>+</span>
    </EditorIconButton>
  );

  const button = container?.querySelector('button');
  expect(button?.getAttribute('aria-label')).toBe('Open project');
  expect(button?.getAttribute('data-active')).toBe('true');
  expect(button?.className).toContain('h-9 w-9');
  expect(button?.className).toContain('cursor-pointer');
  expect(button?.className).toContain('rounded-[8px]');
  expect(button?.className).toContain(
    'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_34%'
  );
  expect(button?.className).toContain('text-[var(--sniptale-color-accent)]');
  expect(button?.className).not.toContain('border-transparent bg-transparent');
  expect(button?.className).not.toContain('text-[var(--sniptale-color-text-secondary)]');
  expect(button?.className).not.toContain('var(--sniptale-color-surface-hover)_84%');
  expect(button?.className).not.toContain('shadow-[0_0_0_1px_color-mix');

  act(() => {
    button?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    button?.click();
  });

  expect(onMouseDown).toHaveBeenCalledTimes(1);
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('prevents clicks when the icon button is disabled', () => {
  const onClick = vi.fn();

  render(
    <EditorIconButton title="Delete" disabled onClick={onClick}>
      <span>x</span>
    </EditorIconButton>
  );

  const button = container?.querySelector('button');
  expect(button?.disabled).toBe(true);

  act(() => {
    button?.click();
  });

  expect(onClick).not.toHaveBeenCalled();
});

it('keeps default and danger toolbar chrome separate from matte CTA icon treatments', () => {
  render(
    <div>
      <EditorDivider className="custom-divider" />
      <EditorIconButton title="Back" className="custom-button">
        <span>{'<'}</span>
      </EditorIconButton>
      <EditorIconButton title="Reset" danger disabled>
        <span>!</span>
      </EditorIconButton>
    </div>
  );

  const buttons = container?.querySelectorAll('button');
  const divider = container?.querySelector('.custom-divider');

  expect(divider?.className).toContain('h-full w-px min-h-4');
  expect(buttons?.[0]?.getAttribute('data-active')).toBe('false');
  expect(buttons?.[0]?.className).toContain('border-transparent bg-transparent');
  expect(buttons?.[0]?.className).toContain(
    'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_84%,transparent)]'
  );
  expect(buttons?.[0]?.className).toContain('custom-button');
  expect(buttons?.[1]?.disabled).toBe(true);
  expect(buttons?.[1]?.className).toContain('var(--sniptale-color-danger)_22%');
  expect(buttons?.[1]?.className).toContain('cursor-default opacity-55');
  expect(buttons?.[1]?.className).toContain('var(--sniptale-color-border-soft)_88%');
});

it('renders divider orientation and badge content', () => {
  render(
    <div>
      <EditorDivider vertical={false} />
      <ValueBadge title="Step count">12</ValueBadge>
    </div>
  );

  const divider = container?.querySelector('div[class*="h-px"]');
  const badge = container?.querySelector('span[title="Step count"]');

  expect(divider?.className).toContain('h-px');
  expect(badge?.textContent).toBe('12');
  expect(badge?.className).toContain('surface-hover');
});

it('renders shared editor toolbar shell, section, and responsive divider chrome', () => {
  render(
    <EditorToolbarShell className="custom-shell">
      <EditorToolbarSection dataUi="test.toolbar.section" className="custom-section">
        <EditorIconButton title="Tool">
          <span>+</span>
        </EditorIconButton>
      </EditorToolbarSection>
      <EditorToolbarDivider className="custom-toolbar-divider" />
    </EditorToolbarShell>
  );

  const shell = container?.firstElementChild as HTMLElement | null;
  const section = container?.querySelector('[data-ui="test.toolbar.section"]');
  const divider = container?.querySelector('.custom-toolbar-divider');

  expect(shell?.className).toContain('items-stretch');
  expect(shell?.className).toContain('rounded-none');
  expect(shell?.className).toContain('custom-shell');
  expect(section?.className).toContain('gap-1.5');
  expect(section?.className).toContain('custom-section');
  expect(divider?.className).toContain('hidden h-8 lg:block');
});
