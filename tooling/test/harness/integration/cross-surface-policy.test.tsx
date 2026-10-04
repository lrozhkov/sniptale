// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const initial = {
    cleanupEnabled: true,
    defaultDestination: 'temporary' as const,
    draftRetentionDays: 30,
    videoDraftRetentionDays: 7,
    trashCleanupEnabled: false,
    trashRetentionDays: 30,
  };
  type Policy = typeof initial;
  const listeners = new Set<(settings: { localStoragePolicy: Policy }) => void>();
  let policy: Policy = initial;
  const publish = (next: Policy) => {
    policy = next;
    for (const listener of listeners) listener({ localStoragePolicy: next });
  };
  return {
    initial,
    listeners,
    getPolicy: () => policy,
    publish,
    load: vi.fn(async () => ({ localStoragePolicy: policy })),
    patch: vi.fn(async (change: Partial<Policy>, expected: Policy) => {
      if (
        Object.keys(policy).some(
          (key) => policy[key as keyof Policy] !== expected[key as keyof Policy]
        )
      ) {
        throw new Error('stale');
      }
      const next = { ...policy, ...change };
      publish(next);
      return { localStoragePolicy: next };
    }),
  };
});

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: vi.fn() }));
vi.mock(
  '../../../../apps/extension/src/composition/persistence/settings',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../apps/extension/src/composition/persistence/settings')
    >()),
    loadSettings: fixture.load,
    patchLocalStoragePolicy: fixture.patch,
    subscribeToSettingsChanges: (listener: Parameters<typeof fixture.listeners.add>[0]) => {
      fixture.listeners.add(listener);
      return () => fixture.listeners.delete(listener);
    },
  })
);

import { useStoragePolicyState } from '../../../../apps/extension/src/settings/sections/capture/storage-drafts/use-storage-policy-state';
import { useTrashRetentionPolicy } from '../../../../apps/extension/src/gallery/library/sidebar/trash-retention-state';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../../apps/extension/src/composition/persistence/library-lifecycle';
import { StaleLocalStoragePolicyError } from '../../../../apps/extension/src/composition/persistence/settings';

it('keeps Settings and Gallery Trash on one policy across edits, failure, retry and reopen', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root = createRoot(container);
  let settings: ReturnType<typeof useStoragePolicyState>;
  let gallery: ReturnType<typeof useTrashRetentionPolicy>;
  function BothViews() {
    settings = useStoragePolicyState();
    gallery = useTrashRetentionPolicy();
    return null;
  }
  await act(async () => root.render(<BothViews />));
  await act(async () => Promise.resolve());
  expect(settings!.policyLoaded).toBe(true);
  expect(gallery!.policy?.trashRetentionDays).toBe(30);

  await act(async () =>
    settings!.updatePolicy({ trashCleanupEnabled: true, trashRetentionDays: 7 })
  );
  expect(gallery!.policy).toMatchObject({ trashCleanupEnabled: true, trashRetentionDays: 7 });
  expect(fixture.getPolicy().draftRetentionDays).toBe(30);

  await act(async () => gallery!.onChange({ trashRetentionDays: 14 }));
  expect(settings!.policy.trashRetentionDays).toBe(14);
  expect(fixture.getPolicy().defaultDestination).toBe('temporary');

  fixture.patch.mockRejectedValueOnce(new Error('quota'));
  await act(async () => gallery!.onChange({ trashRetentionDays: 90 }));
  expect(gallery!.feedback).toBe('error');
  expect(settings!.policy.trashRetentionDays).toBe(14);
  await act(async () => gallery!.onRetry());
  expect(fixture.getPolicy().trashRetentionDays).toBe(90);
  expect(settings!.policy.trashRetentionDays).toBe(90);

  fixture.patch.mockRejectedValueOnce(new Error('quota'));
  await act(async () => gallery!.onChange({ trashRetentionDays: 180 }));
  const writesBeforeExternalEdit = fixture.patch.mock.calls.length;
  await act(async () => fixture.publish({ ...fixture.getPolicy(), trashRetentionDays: 60 }));
  await act(async () => gallery!.onRetry());
  expect(fixture.patch).toHaveBeenCalledTimes(writesBeforeExternalEdit);
  expect(settings!.policy.trashRetentionDays).toBe(60);

  fixture.patch.mockImplementationOnce(async () => {
    fixture.publish({ ...fixture.getPolicy(), trashRetentionDays: 90 });
    throw new StaleLocalStoragePolicyError();
  });
  await act(async () => settings!.updatePolicy(DEFAULT_LOCAL_STORAGE_POLICY));
  await act(async () => Promise.resolve());
  expect(settings!.policy.trashRetentionDays).toBe(90);
  expect(gallery!.policy?.trashRetentionDays).toBe(90);

  await act(async () => settings!.updatePolicy(DEFAULT_LOCAL_STORAGE_POLICY));
  expect(settings!.policy).toMatchObject({ cleanupEnabled: true, trashCleanupEnabled: false });
  expect(gallery!.policy).toMatchObject({ trashCleanupEnabled: false, trashRetentionDays: 30 });

  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<BothViews />));
  await act(async () => Promise.resolve());
  expect(settings!.policy.trashRetentionDays).toBe(30);
  expect(gallery!.policy?.trashRetentionDays).toBe(30);
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
