// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ loadSettings: vi.fn() }));
vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
import { useWebSnapshotAvailability } from './snapshot-availability';

beforeEach(() => mocks.loadSettings.mockReset());

it('loads the normalized opt-in and fails closed when settings cannot be read', async () => {
  mocks.loadSettings.mockResolvedValueOnce({ webSnapshotEnabled: true });
  let state!: ReturnType<typeof useWebSnapshotAvailability>;
  function Harness() {
    state = useWebSnapshotAvailability();
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<Harness />));
  expect(state).toEqual({ enabled: true, status: 'loaded' });
  act(() => root.unmount());

  mocks.loadSettings.mockRejectedValueOnce(new Error('unavailable'));
  const secondRoot = createRoot(container);
  await act(async () => secondRoot.render(<Harness />));
  expect(state).toEqual({ enabled: false, status: 'error' });
  act(() => secondRoot.unmount());
});

it('does not publish a late result after unmount', async () => {
  let resolve!: (value: { webSnapshotEnabled: boolean }) => void;
  mocks.loadSettings.mockReturnValueOnce(new Promise((done) => (resolve = done)));
  function Harness() {
    useWebSnapshotAvailability();
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  act(() => root.unmount());
  await act(async () => resolve({ webSnapshotEnabled: true }));
});
