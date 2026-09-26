// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
const save = vi.hoisted(() => vi.fn());
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  saveScenarioProjectRecord: save,
}));
import { useGuideAutosave } from './autosave';

let root: Root;
let host: HTMLDivElement;
let input: Parameters<typeof useGuideAutosave>[0];
function Harness() {
  useGuideAutosave(input);
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  save.mockReset();
  const base = createGuideProject('Guide', 'guide', 1);
  input = {
    project: { ...base, name: 'Edited' },
    dirty: true,
    conflict: false,
    protectUnsaved: true,
    saved: { current: base },
    busy: { current: false },
    autosaving: { current: false },
    generation: { current: 0 },
    onStatus: vi.fn(),
    onPublish: vi.fn(),
  };
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('cancels the debounce when the page unmounts', async () => {
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(100));
  act(() => root.render(null));
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(save).not.toHaveBeenCalled();
});
it('does not publish a completed write after the page owner changes generation', async () => {
  let finish: (() => void) | undefined;
  save.mockImplementation(
    (project) =>
      new Promise((resolve) => {
        finish = () => resolve({ ...project, updatedAt: 2 });
      })
  );
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(input.busy.current).toBe(true);
  input.generation.current += 1;
  act(() => root.render(null));
  await act(async () => finish?.());
  expect(input.onPublish).not.toHaveBeenCalled();
  expect(input.onStatus).toHaveBeenCalledTimes(1);
  expect(input.saved.current?.name).toBe('Guide');
  expect(input.busy.current).toBe(false);
});

it('cancels queued autosave, protects paused edits on unload and resumes the latest value', async () => {
  save.mockImplementation(async (project) => ({ ...project, updatedAt: 2 }));
  act(() => root.render(<Harness />));
  input = { ...input, enabled: false };
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  expect(save).not.toHaveBeenCalled();
  input = { ...input, project: { ...input.project!, name: 'Latest paused edit' }, enabled: true };
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(save).toHaveBeenCalledWith(input.project, {
    baseUpdatedAt: input.saved.current!.updatedAt === 2 ? 1 : input.saved.current!.updatedAt,
  });
  expect(input.onPublish).toHaveBeenCalled();
});

it('does not retry a duplicate-tab conflict by toggling autosave', async () => {
  input = { ...input, conflict: true, enabled: false };
  act(() => root.render(<Harness />));
  input = { ...input, enabled: true };
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(save).not.toHaveBeenCalled();
});
