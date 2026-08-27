// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const updateSettings = vi.fn();
vi.mock('../../../runtime/store/useSettingsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/store/useSettingsStore')>()),
  useSettingsStore: () => ({
    settings: {
      anonymousCrossOriginSnapshotAssetsEnabled: true,
      authenticatedSnapshotAssetsEnabled: true,
      webSnapshotEnabled: false,
    },
    updateSettings,
  }),
}));
import { useWebSnapshotsController } from './controller';

beforeEach(() => {
  updateSettings.mockReset().mockResolvedValue(undefined);
});

it('projects the opt-in state and persists each setting through the canonical store', async () => {
  let state!: ReturnType<typeof useWebSnapshotsController>;
  function Harness() {
    state = useWebSnapshotsController();
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Harness />));

  await act(async () => state.updateWebSnapshotEnabled(true));
  expect(updateSettings).toHaveBeenCalledWith({ webSnapshotEnabled: true });

  await act(async () => state.updateAnonymousCrossOriginSnapshotAssetsEnabled(false));
  expect(updateSettings).toHaveBeenLastCalledWith({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
  });
  act(() => root.unmount());
});

it('surfaces a failed persistent update without changing authority locally', async () => {
  updateSettings.mockRejectedValueOnce(new Error('save failed'));
  let state!: ReturnType<typeof useWebSnapshotsController>;
  function Harness() {
    state = useWebSnapshotsController();
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Harness />));

  await act(async () => state.updateWebSnapshotEnabled(true));
  expect(state.saveFailed).toBe(true);
  expect(state.webSnapshotEnabled).toBe(false);
  act(() => root.unmount());
});

it('prevents a second persistent mutation while the first setting is pending', async () => {
  let resolveWrite!: () => void;
  updateSettings.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveWrite = resolve))
  );
  let state!: ReturnType<typeof useWebSnapshotsController>;
  function Harness() {
    state = useWebSnapshotsController();
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Harness />));

  let firstWrite!: Promise<void>;
  act(() => {
    firstWrite = state.updateWebSnapshotEnabled(true);
  });
  await act(async () => state.updateAuthenticatedSnapshotAssetsEnabled(false));
  expect(updateSettings).toHaveBeenCalledTimes(1);

  resolveWrite();
  await act(async () => firstWrite);
  expect(state.pendingSetting).toBeNull();
  act(() => root.unmount());
});
