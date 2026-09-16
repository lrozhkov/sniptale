// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ acquire: vi.fn(), prune: vi.fn() }));
vi.mock('../../../composition/persistence/scenario/resource-sessions', () => ({
  acquireScenarioResourceSession: io.acquire,
}));
vi.mock('../../../composition/persistence/scenario/retention', () => ({
  pruneScenarioResources: io.prune,
}));
import { useGuideResourceSession } from './resource-session';
let root: Root;
let host: HTMLDivElement;
let enter: ReturnType<typeof useGuideResourceSession>;
function Harness() {
  enter = useGuideResourceSession();
  return null;
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.prune.mockResolvedValue(0);
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
it('acquires the next project before releasing the previous session and keeps it on failure', async () => {
  const release = vi.fn(async () => undefined);
  io.acquire.mockResolvedValueOnce({ release });
  expect(await enter('first')).toBe(true);
  io.acquire.mockImplementationOnce(async () => {
    expect(release).not.toHaveBeenCalled();
    throw new Error('unavailable');
  });
  await expect(enter('second')).rejects.toThrow('unavailable');
  expect(release).not.toHaveBeenCalled();
  io.acquire.mockResolvedValueOnce({ release: async () => undefined });
  expect(await enter('second')).toBe(true);
  expect(release).toHaveBeenCalledOnce();
});
it('releases an acquisition that finishes after unmount and never admits its stale result', async () => {
  const release = vi.fn(async () => undefined);
  let resolve!: (value: { release: typeof release }) => void;
  io.acquire.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const pending = enter('first');
  await Promise.resolve();
  await act(async () => root.unmount());
  resolve({ release });
  expect(await pending).toBe(false);
  expect(release).toHaveBeenCalledOnce();
});
