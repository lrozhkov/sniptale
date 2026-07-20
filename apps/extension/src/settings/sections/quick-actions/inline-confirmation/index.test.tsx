// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SettingsInlineConfirmation } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderConfirmation(message: string | null) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<SettingsInlineConfirmation message={message} />));
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

it('renders nothing without a confirmation message', async () => {
  await renderConfirmation(null);

  expect(container?.childElementCount).toBe(0);
});

it('announces the current confirmation message politely', async () => {
  await renderConfirmation('Saved');

  const status = container?.querySelector('[role="status"]');
  expect(status?.getAttribute('aria-live')).toBe('polite');
  expect(status?.textContent).toContain('Saved');
  expect(status?.querySelector('svg')).not.toBeNull();
});
