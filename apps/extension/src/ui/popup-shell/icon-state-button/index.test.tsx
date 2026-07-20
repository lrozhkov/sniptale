// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PopupIconStateButton } from './index';

function TestIcon({ className }: { className?: string }) {
  return <svg className={className} data-testid="icon" />;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderButton(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

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

it('uses the filled active contract for icon-only popup controls', () => {
  renderButton(
    <PopupIconStateButton
      icon={TestIcon}
      label="Viewport"
      active
      accentClassName="text-[var(--sniptale-color-accent)]"
      onClick={() => undefined}
    />
  );

  const button = container?.querySelector('button');
  const icon = container?.querySelector('svg');

  expect(button?.className).toContain(
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_74%,transparent)]'
  );
  expect(button?.className).toContain('rounded-[12px]');
  expect(icon?.getAttribute('class')).toContain('text-[var(--sniptale-color-accent)]');
});

it('keeps idle buttons borderless and hover-surface clickable', () => {
  const onClick = vi.fn();

  renderButton(
    <PopupIconStateButton
      icon={TestIcon}
      label="Viewport"
      active={false}
      accentClassName="text-[var(--sniptale-color-accent)]"
      onClick={onClick}
    />
  );

  const button = container?.querySelector('button');

  act(() => {
    button?.click();
  });

  expect(button?.className).toContain('bg-transparent');
  expect(button?.className).toContain('border-none');
  expect(button?.className).toContain('rounded-[12px]');
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('renders stacked labels and inactive slash decoration when requested', () => {
  renderButton(
    <PopupIconStateButton
      icon={TestIcon}
      label="Microphone"
      description="Toggle microphone capture"
      active={false}
      accentClassName="text-[var(--sniptale-color-accent)]"
      inactiveDecoration="slash"
      layout="stacked"
      dataUi="popup.test.microphone"
      onClick={() => undefined}
    />
  );

  const button = container?.querySelector('button');
  const label = Array.from(container?.querySelectorAll('span') ?? []).find(
    (element) => element.textContent === 'Microphone'
  );

  expect(button?.getAttribute('title')).toBe('Microphone. Toggle microphone capture');
  expect(button?.getAttribute('data-ui')).toBe('popup.test.microphone');
  expect(button?.className).toContain('min-h-[68px]');
  expect(label).toBeTruthy();
  expect(container?.querySelectorAll('span')).toHaveLength(3);
});

it('uses disabled styling and suppresses inactive decoration for unavailable controls', () => {
  renderButton(
    <PopupIconStateButton
      icon={TestIcon}
      label="System audio"
      active={false}
      disabled
      accentClassName="text-[var(--sniptale-color-accent)]"
      inactiveDecoration="slash"
      onClick={() => undefined}
    />
  );

  const button = container?.querySelector('button');
  const icon = container?.querySelector('svg');

  expect(button?.disabled).toBe(true);
  expect(button?.className).toContain('cursor-not-allowed opacity-40');
  expect(icon?.getAttribute('class')).toContain('text-[var(--sniptale-color-text-dim)]');
  expect(container?.querySelectorAll('span')).toHaveLength(1);
});

it('supports square geometry for compact tool rows', () => {
  renderButton(
    <PopupIconStateButton
      icon={TestIcon}
      label="Microphone"
      active={false}
      accentClassName="text-[var(--sniptale-color-accent)]"
      geometry="square"
      onClick={() => undefined}
    />
  );

  expect(container?.querySelector('button')?.className).toContain('aspect-square');
});
