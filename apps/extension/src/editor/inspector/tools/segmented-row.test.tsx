// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: ({
    active,
    children,
    className,
    onClick,
    ...buttonProps
  }: {
    active?: boolean;
    children: React.ReactNode;
    className?: string;
    onClick: () => void;
    title?: string;
  }) => (
    <button
      type="button"
      data-active={active ? 'true' : 'false'}
      className={className}
      onClick={onClick}
      {...buttonProps}
    >
      {children}
    </button>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { SegmentedRow } from './segmented-row';

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

it('renders a two-column segmented row and applies the clicked value', () => {
  const onChange = vi.fn();

  render(
    <SegmentedRow
      ariaLabel="Trajectory"
      columns={2}
      value="straight"
      onChange={onChange}
      options={[
        { label: 'Straight', value: 'straight' },
        { label: 'Curve', value: 'curve' },
      ]}
    />
  );

  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'Curve')
      ?.click();
  });

  expect(container?.querySelector('[role="group"]')?.className).toContain('grid-cols-2');
  expect(container?.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Straight');
  expect(onChange).toHaveBeenCalledWith('curve');
});

it('renders a three-column segmented row for shadow variants', () => {
  render(
    <SegmentedRow
      ariaLabel="Shadow"
      columns={3}
      value="soft"
      onChange={() => undefined}
      options={[
        { label: 'None', value: 'none' },
        { label: 'Soft', value: 'soft' },
        { label: 'Hard', value: 'hard' },
      ]}
    />
  );

  expect(container?.querySelector('[role="group"]')?.className).toContain('grid-cols-3');
  expect(container?.querySelectorAll('button')).toHaveLength(3);
  expect(container?.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Soft');
});

it('adds native hints and larger icon sizing for icon selector options', () => {
  render(
    <SegmentedRow
      ariaLabel="Corners"
      columns={2}
      value="sharp"
      onChange={() => undefined}
      options={[
        { label: 'Sharp', value: 'sharp', icon: <svg data-testid="sharp" /> },
        { label: 'Round', value: 'round', icon: <svg data-testid="round" /> },
      ]}
    />
  );

  const button = container?.querySelector('button[title="Sharp"]');
  expect(button?.getAttribute('aria-label')).toBe('Sharp');
  expect(button?.querySelector('span')?.className).toContain('!h-[17px]');
});
