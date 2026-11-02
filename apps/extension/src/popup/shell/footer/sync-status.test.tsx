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
function render(status: SyncPopupRuntimeStatus | null = base, pending = false, failed = false) {
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
}
function click() {
  act(() => container.querySelector('button')?.click());
}
it('keeps an unconfigured or not yet observed connection out of the footer', () => {
  render(null);
  expect(container.textContent).toBe('');
  render({ ...base, configuration: 'unconfigured' });
  expect(container.querySelector('button')).toBeNull();
});
it('offers one explicit sync for waiting edits and announces status separately from the action', () => {
  render();
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Waiting to sync');
  expect(container.querySelector('button')?.textContent).toBe('Sync now');
  expect(container.querySelector('[role="status"] button')).toBeNull();
  click();
  expect(sync).toHaveBeenCalledOnce();
  expect(unlock).not.toHaveBeenCalled();
});
it('does not call local publication complete remote synchronization', () => {
  render({ ...base, localPublication: 'published' });
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Local changes sent');
  render({
    ...base,
    localPublication: 'published',
    remote: { knowledge: 'observed-pass', outcome: 'deferred' },
  });
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Local changes sent');
  render({
    ...base,
    localPublication: 'published',
    remote: { knowledge: 'observed-pass', outcome: 'complete' },
  });
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Synced');
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
  expect(container.querySelector('button')?.textContent).toBe('Unlock');
  click();
  expect(unlock).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
});
it('preserves pause instead of offering unlock and sync', () => {
  render({ ...base, connection: 'paused', protection: 'locked' });
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Sync paused');
  click();
  expect(details).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
  expect(unlock).not.toHaveBeenCalled();
});
it('keeps unknown projection actionable without claiming an error or successful sync', () => {
  render({ ...base, localPublication: 'unknown' });
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Sync status unknown');
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
  expect(container.querySelector('button')?.disabled).toBe(true);
  expect(container.querySelector('button')?.getAttribute('aria-busy')).toBe('true');
  click();
  expect(sync).not.toHaveBeenCalled();
});

it('shows a safe action failure and keeps explicit retry available', () => {
  render(base, false, true);
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Could not complete the action. Try again.'
  );
  expect(container.querySelector('button')?.disabled).toBe(false);
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
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Some uploads are interrupted'
  );
  expect(container.querySelector('button')?.textContent).toBe('View uploads');
  click();
  expect(repair).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
  expect(unlock).not.toHaveBeenCalled();
  expect(details).not.toHaveBeenCalled();
});

it('keeps the retained upload navigation neutral in Russian', () => {
  activeLocale.current = 'ru';
  render({ ...base, issue: 'queue-problem', repair: 'queue-problems' });
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Некоторые отправки прерваны'
  );
  expect(container.querySelector('button')?.textContent).toBe('Посмотреть отправки');
  click();
  expect(repair).toHaveBeenCalledOnce();
  expect(sync).not.toHaveBeenCalled();
});
it('keeps explicit finite failures and active work ahead of the neutral retained upload hint', () => {
  render({ ...base, issue: 'temporary', repair: 'queue-problems' });
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Sync needs attention');
  expect(container.querySelector('button')?.textContent).toBe('Resolve');
  render({ ...base, activity: 'running', issue: 'queue-problem', repair: 'queue-problems' });
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Syncing');
  expect(container.querySelector('button')?.textContent).toBe('Details');
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
  expect(container.querySelector('button')?.textContent).toBe('Resolve');
  click();
  expect(repair).toHaveBeenCalledOnce();
  expect(details).not.toHaveBeenCalled();
  expect(unlock).not.toHaveBeenCalled();
  expect(sync).not.toHaveBeenCalled();
  render({ ...base, connection: 'paused', protection: 'locked', issue: null });
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Sync paused');
  expect(container.querySelector('button')?.textContent).toBe('Details');
  click();
  expect(details).toHaveBeenCalledOnce();
  expect(repair).toHaveBeenCalledOnce();
  expect(unlock).not.toHaveBeenCalled();
  expect(sync).not.toHaveBeenCalled();
});
