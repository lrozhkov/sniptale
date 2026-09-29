// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { TrashRetentionControls } from './trash-retention-controls';
import type { GalleryTrashRetentionProps } from './types';

let container: HTMLDivElement;
let root: Root;

function createProps(): GalleryTrashRetentionProps {
  return {
    status: 'ready',
    policy: { trashCleanupEnabled: false, trashRetentionDays: 30 },
    saving: false,
    feedback: null,
    onChange: vi.fn(),
    onRetry: vi.fn(),
  };
}

function render(props: GalleryTrashRetentionProps) {
  act(() => root.render(<TrashRetentionControls {...props} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('shows loading and unavailable states without presenting defaults as saved', () => {
  const props = createProps();
  render({ ...props, status: 'loading', policy: null });
  expect(container.textContent).toContain(translate('gallery.app.trashRetentionLoading'));
  expect(container.querySelector('[role="switch"]')).toBeNull();

  render({ ...props, status: 'unavailable', policy: null });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    translate('gallery.app.trashRetentionUnavailable')
  );
  expect(container.querySelector('[role="switch"]')).toBeNull();
  const retry = Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(translate('gallery.app.trashRetentionRetry'))
  );
  act(() => retry?.click());
  expect(props.onRetry).toHaveBeenCalledOnce();
});

it('shows committed toggle and days, blocks input while saving, and explains later cleanup', () => {
  const props = createProps();
  render(props);
  const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  const select = container.querySelector<HTMLButtonElement>(
    `[aria-label="${translate('gallery.app.trashRetentionDays')}"]`
  )!;
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(select.disabled).toBe(true);
  expect(select.textContent).toContain('30');
  act(() => toggle.click());
  expect(props.onChange).toHaveBeenCalledWith({ trashCleanupEnabled: true });
  expect(container.textContent).toContain(translate('gallery.app.trashRetentionExplanation'));

  render({ ...props, policy: { trashCleanupEnabled: true, trashRetentionDays: 14 }, saving: true });
  expect(toggle.disabled).toBe(true);
  expect(select.disabled).toBe(true);
  expect(container.textContent).toContain(translate('gallery.app.trashRetentionSaving'));

  render({
    ...props,
    status: 'loading',
    policy: { trashCleanupEnabled: true, trashRetentionDays: 14 },
  });
  expect(toggle.disabled).toBe(true);
  expect(select.disabled).toBe(true);

  render({
    ...props,
    policy: { trashCleanupEnabled: true, trashRetentionDays: 14 },
    feedback: 'saved',
  });
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  expect(select.disabled).toBe(false);
  expect(select.textContent).toContain('14');
  expect(container.textContent).toContain(translate('gallery.app.trashRetentionSaved'));
  act(() => select.click());
  const options = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'));
  expect(options.map((option) => Number(option.textContent?.match(/\d+/)?.[0]))).toEqual([
    1, 3, 7, 14, 30, 60, 90, 180, 365,
  ]);
  act(() => options[6]?.click());
  expect(props.onChange).toHaveBeenCalledWith({ trashRetentionDays: 90 });
});

it('keeps the committed value visible and offers retry after a failed save', () => {
  const props = createProps();
  render({ ...props, feedback: 'error' });
  expect(container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    translate('gallery.app.trashRetentionSaveFailed')
  );
  const retry = Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(translate('gallery.app.trashRetentionRetry'))
  );
  act(() => retry?.click());
  expect(props.onRetry).toHaveBeenCalledOnce();
});
