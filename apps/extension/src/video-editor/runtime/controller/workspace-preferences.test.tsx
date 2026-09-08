// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  type WorkspacePreferences,
} from '../../persistence/workspace-preferences';
import { WorkspacePreferencesProvider, useWorkspacePreference } from './workspace-preferences';

const storage = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('../../persistence/workspace-preferences', async (original) => ({
  ...(await original<object>()),
  loadWorkspacePreferences: storage.load,
  saveWorkspacePreferences: storage.save,
}));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
function Harness() {
  const [mode, setMode] = useWorkspacePreference('inspectorPresentation');
  const [width, setWidth] = useWorkspacePreference('inspectorWidth');
  return (
    <>
      <button onClick={() => setMode(mode === 'all' ? 'sections' : 'all')}>{mode}</button>
      <button onClick={() => setWidth(420)}>{width}</button>
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  root = createRoot(container);
  storage.load.mockResolvedValue(DEFAULT_WORKSPACE_PREFERENCES);
  storage.save.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const render = () =>
  root.render(
    <WorkspacePreferencesProvider>
      <Harness />
    </WorkspacePreferencesProvider>
  );

it('merges an early gesture with late hydration without overwriting stored dimensions', async () => {
  let resolve!: (value: WorkspacePreferences) => void;
  storage.load.mockReturnValue(
    new Promise<WorkspacePreferences>((done) => {
      resolve = done;
    })
  );
  act(render);
  act(() => container.querySelector('button')!.click());
  expect(storage.save).not.toHaveBeenCalled();
  await act(async () => resolve({ ...DEFAULT_WORKSPACE_PREFERENCES, inspectorWidth: 390 }));
  expect(container.textContent).toBe('all390');
  expect(storage.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ inspectorPresentation: 'all', inspectorWidth: 390 })
  );
});

it('coalesces pending changes behind a slow save and restores the final layout on remount', async () => {
  let finish!: () => void;
  storage.save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  await act(async () => render());
  act(() => container.querySelector('button')!.click());
  act(() => container.querySelectorAll('button')[1]!.click());
  act(() => container.querySelector('button')!.click());
  expect(storage.save).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  const saved = storage.save.mock.lastCall?.[0];
  expect(saved).toEqual({ ...DEFAULT_WORKSPACE_PREFERENCES, inspectorWidth: 420 });
  act(() => root.unmount());
  root = createRoot(container);
  storage.load.mockResolvedValue(saved);
  await act(async () => render());
  expect(container.textContent).toBe('sections420');
});

it('keeps controls working after unavailable storage and retries on the next edit', async () => {
  storage.load.mockRejectedValue(new Error('unavailable'));
  storage.save.mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => render());
  await act(async () => container.querySelector('button')!.click());
  expect(container.textContent).toBe('all');
  await act(async () => container.querySelectorAll('button')[1]!.click());
  expect(storage.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ inspectorPresentation: 'all', inspectorWidth: 420 })
  );
});
