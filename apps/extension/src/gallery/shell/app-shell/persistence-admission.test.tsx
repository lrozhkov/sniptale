// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DatabaseAdmissionStatus } from '../../../composition/persistence/infrastructure/indexed-db/admission';
import { translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { GalleryPersistenceAdmission } from './persistence-admission';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderWithStatus(status: DatabaseAdmissionStatus) {
  await act(async () => {
    root.render(
      <GalleryPersistenceAdmission prepare={vi.fn(async () => status)}>
        <div>library-ready</div>
      </GalleryPersistenceAdmission>
    );
  });
}

it('holds the library behind checking and renders it only after ready admission', async () => {
  let resolve!: (status: { databaseVersion: number; status: 'ready' }) => void;
  const prepare = vi.fn(
    () => new Promise<{ databaseVersion: number; status: 'ready' }>((done) => (resolve = done))
  );
  await act(async () => {
    root.render(
      <GalleryPersistenceAdmission prepare={prepare}>
        <div>library-ready</div>
      </GalleryPersistenceAdmission>
    );
  });
  expect(container.textContent).toContain(translate('gallery.recovery.checkingTitle'));
  expect(container.textContent).not.toContain('library-ready');

  await act(async () => resolve({ databaseVersion: 1, status: 'ready' }));
  expect(container.textContent).toContain('library-ready');
});

it.each([
  ['blocked', 'gallery.recovery.blockedTitle'],
  ['backup-required', 'gallery.recovery.backupTitle'],
  ['insufficient-space', 'gallery.recovery.spaceTitle'],
] as const)('surfaces %s without offering destructive reset', async (status, titleKey) => {
  const admission =
    status === 'blocked'
      ? { databaseVersion: null, reason: 'connection-blocked' as const, status }
      : status === 'backup-required'
        ? {
            databaseVersion: 1,
            reason: 'destructive-migration' as const,
            status,
            targetDatabaseVersion: 2,
          }
        : {
            availableBytes: 1,
            databaseVersion: 1,
            requiredBytes: 2,
            status,
            targetDatabaseVersion: 2,
          };
  await renderWithStatus(admission);
  expect(container.textContent).toContain(translate(titleKey));
  expect(container.textContent).not.toContain(translate('gallery.recovery.reset'));
  if (status === 'insufficient-space') {
    expect(container.textContent).toContain(formatBytes(2));
    expect(container.textContent).toContain(formatBytes(1));
  }
});

it('surfaces a failed journal resume as a localized retryable reset state', async () => {
  await renderWithStatus({
    databaseVersion: null,
    reason: 'recovery-reset-failed',
    status: 'blocked',
  });

  expect(container.textContent).toContain(translate('gallery.recovery.resetIncompleteTitle'));
  expect(container.textContent).toContain(translate('gallery.recovery.resetFailed'));
  expect(container.textContent).toContain(translate('gallery.recovery.retry'));
  expect(container.textContent).not.toContain(translate('gallery.recovery.reset'));
});

it('requires confirmation before an explicit corrupt-data reset and restores the library', async () => {
  const reset = vi.fn(async () => ({ databaseVersion: 1, status: 'ready' as const }));
  await act(async () => {
    root.render(
      <GalleryPersistenceAdmission
        prepare={vi.fn(async () => ({
          databaseVersion: 1,
          reason: 'domain-contracts' as const,
          status: 'corrupt' as const,
        }))}
        reset={reset}
      >
        <div>library-ready</div>
      </GalleryPersistenceAdmission>
    );
  });
  const resetButton = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === translate('gallery.recovery.reset')
  );
  act(() => resetButton?.click());
  expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(reset).not.toHaveBeenCalled();
  const confirmButtons = [...container.querySelectorAll('button')].filter(
    (button) => button.textContent === translate('gallery.recovery.reset')
  );
  await act(async () => confirmButtons.at(-1)?.click());
  expect(reset).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('library-ready');
});

it('surfaces a failed destructive reset and keeps recovery actions operable', async () => {
  const reset = vi.fn(async () => Promise.reject(new Error('partial cleanup')));
  await act(async () => {
    root.render(
      <GalleryPersistenceAdmission
        prepare={vi.fn(async () => ({
          databaseVersion: 1,
          reason: 'domain-contracts' as const,
          status: 'corrupt' as const,
        }))}
        reset={reset}
      >
        <div>library-ready</div>
      </GalleryPersistenceAdmission>
    );
  });
  const resetButton = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === translate('gallery.recovery.reset')
  );
  act(() => resetButton?.click());
  const confirmButtons = [...container.querySelectorAll('button')].filter(
    (button) => button.textContent === translate('gallery.recovery.reset')
  );
  await act(async () => confirmButtons.at(-1)?.click());

  expect(container.textContent).toContain(translate('gallery.recovery.resetFailed'));
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  expect(
    [...container.querySelectorAll('button')].some(
      (button) => button.textContent === translate('gallery.recovery.reset') && !button.disabled
    )
  ).toBe(true);
});
