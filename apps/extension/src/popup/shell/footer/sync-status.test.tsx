// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SyncPopupRuntimeStatus } from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { PopupSyncStatus } from './sync-status';

const activeLocale = vi.hoisted(() => ({ current: 'en' }));

vi.mock('../../../platform/i18n/popup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n/popup')>();
  return { ...actual, useAppLocale: () => activeLocale.current };
});
let root: Root;
let container: HTMLDivElement;
const sync = vi.fn();
const unlock = vi.fn();
const details = vi.fn();
const repair = vi.fn();
const base: SyncPopupRuntimeStatus = {
  configuration: 'configured',
  connection: 'active',
  localPublication: 'waiting',
  activity: 'idle',
  remote: { knowledge: 'unknown' },
  protection: 'not-enrolled',
  issue: null,
  repair: null,
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  activeLocale.current = 'en';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function render(
  status: SyncPopupRuntimeStatus | null = base,
  pending = false,
  failed = false,
  open = true
) {
  act(() =>
    root.render(
      <PopupSyncStatus
        status={status}
        pending={pending}
        failed={failed}
        onSync={sync}
        onUnlock={unlock}
        onDetails={details}
        onRepair={repair}
      />
    )
  );
  const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]');
  if (open && trigger?.getAttribute('aria-expanded') === 'false') act(() => trigger.click());
}
function actionButton() {
  return document.querySelector<HTMLButtonElement>('[data-ui="popup.footer.sync-action"]');
}
function click() {
  act(() => actionButton()?.click());
}
it('keeps an unconfigured or not yet observed connection out of the footer', () => {
  render(null);
  expect(container.textContent).toBe('');
  render({ ...base, configuration: 'unconfigured' });
  expect(container.querySelector('button')).toBeNull();
});
it('offers one explicit sync for waiting edits and announces status separately from the action', () => {
  render();
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Waiting to sync');
  expect(actionButton()?.textContent).toBe('Sync now');
  expect(document.querySelector('[role="status"] button')).toBeNull();
  click();
  expect(sync).toHaveBeenCalledOnce();
  expect(unlock).not.toHaveBeenCalled();
});
it('does not call local publication complete remote synchronization', () => {
  render({ ...base, localPublication: 'published' });
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Local changes sent');
  render({
    ...base,
    localPublication: 'published',
    remote: { knowledge: 'observed-pass', outcome: 'deferred' },
  });
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Local changes sent');
  render({
    ...base,
    localPublication: 'published',
    remote: { knowledge: 'observed-pass', outcome: 'complete' },
  });
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Synced');
});
it.each(['running', 'stopping'] as const)(
  'offers details without duplicate sync while %s',
  (activity) => {
    render({ ...base, activity });
    click();
    expect(details).toHaveBeenCalledOnce();
    expect(sync).not.toHaveBeenCalled();
  }
);
it('routes a locked session to explicit unlock', () => {
  render({ ...base, protection: 'locked', repair: 'security' });
  expect(actionButton()?.textContent).toBe('Unlock');
  click();
  expect(unlock).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
});
it('preserves pause instead of offering unlock and sync', () => {
  render({ ...base, connection: 'paused', protection: 'locked' });
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Sync paused');
  click();
  expect(details).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
  expect(unlock).not.toHaveBeenCalled();
});
it('keeps unknown projection actionable without claiming an error or successful sync', () => {
  render({ ...base, localPublication: 'unknown' });
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Sync status unknown');
  click();
  expect(details).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
});
it('offers repair for current missing credentials', () => {
  render({ ...base, connection: 'credentials-required', repair: 'connection' });
  click();
  expect(repair).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
});
it('disables repeat commands while awaiting acknowledgement', () => {
  render(base, true);
  expect(actionButton()?.disabled).toBe(true);
  expect(actionButton()?.getAttribute('aria-busy')).toBe('true');
  click();
  expect(sync).not.toHaveBeenCalled();
});

it('shows a safe action failure and keeps explicit retry available', () => {
  render(base, false, true);
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    'Could not complete the action. Try again.'
  );
  expect(actionButton()?.disabled).toBe(false);
  click();
  expect(sync).toHaveBeenCalledOnce();
});

it('presents retained queue problems as neutral upload navigation instead of manual repair', () => {
  render({
    ...base,
    localPublication: 'published',
    issue: 'queue-problem',
    repair: 'queue-problems',
  });
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    'Some uploads are interrupted'
  );
  expect(actionButton()?.textContent).toBe('View uploads');
  click();
  expect(repair).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
  expect(unlock).not.toHaveBeenCalled();
  expect(details).not.toHaveBeenCalled();
});

it('keeps the retained upload navigation neutral in Russian', () => {
  activeLocale.current = 'ru';
  render({ ...base, issue: 'queue-problem', repair: 'queue-problems' });
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    'Некоторые отправки прерваны'
  );
  expect(actionButton()?.textContent).toBe('Посмотреть отправки');
  click();
  expect(repair).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
});
it('keeps explicit finite failures and active work ahead of the neutral retained upload hint', () => {
  render({ ...base, issue: 'temporary', repair: 'queue-problems' });
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Sync needs attention');
  expect(actionButton()?.textContent).toBe('Resolve');
  render({ ...base, activity: 'running', issue: 'queue-problem', repair: 'queue-problems' });
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Syncing');
  expect(actionButton()?.textContent).toBe('Details');
  click();
  expect(details).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
});

it('offers permission repair while paused and returns to pause details after access is restored', () => {
  render({
    ...base,
    connection: 'paused',
    protection: 'locked',
    issue: 'permission-required',
    repair: 'connection',
  });
  expect(actionButton()?.textContent).toBe('Resolve');
  click();
  expect(repair).toHaveBeenCalledOnce();
  expect(details).not.toHaveBeenCalled();
  expect(unlock).not.toHaveBeenCalled();
  expect(sync).not.toHaveBeenCalled();
  render({ ...base, connection: 'paused', protection: 'locked', issue: null });
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Sync paused');
  expect(actionButton()?.textContent).toBe('Details');
  click();
  expect(details).toHaveBeenCalledOnce();
  expect(repair).toHaveBeenCalledOnce();
  expect(unlock).not.toHaveBeenCalled();
  expect(sync).not.toHaveBeenCalled();
});

it('hides an unknown configuration instead of offering a sync control', () => {
  render({ ...base, configuration: 'unknown', connection: null });
  expect(container.querySelector('button')).toBeNull();
});

it('opens a compact disclosure without running a command and restores focus on Escape', () => {
  render(base, false, false, false);
  const trigger = container.querySelector<HTMLButtonElement>('button');
  expect(trigger?.getAttribute('aria-label')).toBe('Waiting to sync');
  expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  act(() => trigger?.click());
  expect(trigger?.getAttribute('aria-expanded')).toBe('true');
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
  expect(sync).not.toHaveBeenCalled();
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('dismisses the status disclosure on an outside pointer without running a command', () => {
  render();
  act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(sync).not.toHaveBeenCalled();
});
