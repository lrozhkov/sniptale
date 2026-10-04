// @vitest-environment jsdom
import { act } from 'react';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { reduceGuideHistory } from './history';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/public';
const save = vi.hoisted(() => vi.fn());
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  saveScenarioProjectRecord: save,
}));
import { useGuideAutosave, GUIDE_AUTOSAVE_IDLE_MS, GUIDE_AUTOSAVE_MAX_WAIT_MS } from './autosave';

let root: Root;
let host: HTMLDivElement;
let input: Parameters<typeof useGuideAutosave>[0];
let autosave: ReturnType<typeof useGuideAutosave>;
function Harness() {
  autosave = useGuideAutosave(input);
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
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
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
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
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

it('coalesces phrase typing instead of writing after each short pause', async () => {
  save.mockImplementation(async (project) => ({ ...project, updatedAt: Date.now() }));
  for (const name of ['A', 'AB', 'ABC', 'ABCD']) {
    input = { ...input, project: { ...input.project!, name } };
    act(() => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTimeAsync(400));
  }
  expect(save).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'ABCD' }), {
    baseUpdatedAt: 1,
  });
});

it('bounds continuous typing and writes the latest value without waiting for blur', async () => {
  save.mockImplementation(async (project) => ({ ...project, updatedAt: Date.now() }));
  for (let elapsed = 0; elapsed < GUIDE_AUTOSAVE_MAX_WAIT_MS; elapsed += 100) {
    input = { ...input, project: { ...input.project!, name: `Typed ${elapsed}` } };
    act(() => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTimeAsync(100));
  }
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ name: `Typed ${GUIDE_AUTOSAVE_MAX_WAIT_MS - 100}` }),
    { baseUpdatedAt: 1 }
  );
});

it('flushes the latest draft after an older pending write using its acknowledged revision', async () => {
  let release!: () => void;
  save.mockImplementationOnce(
    (source) =>
      new Promise((resolve) => {
        release = () => resolve({ ...source, updatedAt: 2 });
      })
  );
  save.mockImplementation(async (source) => ({ ...source, updatedAt: 3 }));
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  input = { ...input, project: { ...input.project!, name: 'Latest draft' } };
  act(() => root.render(<Harness />));
  const flush = autosave.flushLatest();
  await act(async () => release());
  await expect(flush).resolves.toMatchObject({ name: 'Latest draft', updatedAt: 3 });
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Latest draft' }), {
    baseUpdatedAt: 2,
  });
});

it('keeps a failed draft for explicit retry and does not flush a conflict', async () => {
  save.mockRejectedValueOnce(new Error('Quota'));
  act(() => root.render(<Harness />));
  await expect(autosave.flushLatest()).resolves.toBeNull();
  expect(input.saved.current?.name).toBe('Guide');
  expect(input.onStatus).toHaveBeenLastCalledWith('failed');
  save.mockImplementation(async (source) => ({ ...source, updatedAt: 2 }));
  await expect(autosave.flushLatest()).resolves.toMatchObject({ name: 'Edited' });
  input = { ...input, conflict: true };
  act(() => root.render(<Harness />));
  await expect(autosave.flushLatest()).resolves.toBeNull();
  expect(save).toHaveBeenCalledTimes(2);
});

it('does not drain another project after the pending writer loses its generation', async () => {
  let release!: () => void;
  save.mockImplementationOnce(
    (source) =>
      new Promise((resolve) => {
        release = () => resolve({ ...source, updatedAt: 2 });
      })
  );
  act(() => root.render(<Harness />));
  const flushed = autosave.flushLatest();
  input.generation.current += 1;
  input = { ...input, project: createGuideProject('Other', 'other', 3) };
  act(() => root.render(<Harness />));
  await act(async () => release());
  await expect(flushed).resolves.toBeNull();
  expect(save).toHaveBeenCalledOnce();
  expect(input.saved.current?.id).toBe('guide');
});

it('recognizes its own committed source when persistence returns a different property order', async () => {
  const { name, ...rest } = input.project!;
  const committed = { name, ...rest, updatedAt: 2 };
  save.mockResolvedValueOnce(committed).mockRejectedValueOnce(new Error('Duplicate write'));
  act(() => root.render(<Harness />));
  await expect(autosave.flushLatest()).resolves.toEqual(committed);
  expect(save).toHaveBeenCalledOnce();
});

it('does not reuse a source acknowledgement after another mutation replaces the saved authority', async () => {
  save.mockImplementation(async (source) => ({ ...source, updatedAt: 2 }));
  act(() => root.render(<Harness />));
  await autosave.flushLatest();
  input.saved.current = { ...input.saved.current!, name: 'Imported project change', updatedAt: 3 };
  await autosave.flushLatest();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(input.project, { baseUpdatedAt: 3 });
});

it('settles canonical nested key reordering after a concurrent edit and history timestamp rebase', async () => {
  const project = createGuideProject('Guide', 'guide', 1);
  project.items = [{ ...createGuideStep('Step', 'step'), numbering: { restartAt: 2 } }];
  input = { ...input, project };
  let release!: () => void;
  save.mockImplementationOnce(
    (source) =>
      new Promise((resolve) => {
        release = () => {
          const parsed = parseGuideProject({ ...source, updatedAt: 2 });
          if (parsed.status !== 'ok') throw new Error('Invalid fixture');
          resolve(parsed.project);
        };
      })
  );
  save.mockImplementationOnce(async (source) => {
    const parsed = parseGuideProject({ ...source, updatedAt: 3 });
    if (parsed.status !== 'ok') throw new Error('Invalid fixture');
    return parsed.project;
  });
  save.mockRejectedValue(new Error('Unexpected duplicate canonical save'));
  input.onPublish = (committed, source) => {
    // A queued history publication rebases the current draft rather than adopting source identity.
    const current = { ...input.project! };
    const history = reduceGuideHistory(
      { present: current, past: [], future: [], group: null },
      { kind: 'publish', project: committed, source }
    );
    input = { ...input, project: history.present };
    act(() => root.render(<Harness />));
  };
  act(() => root.render(<Harness />));
  const flushed = autosave.flushLatest();
  input = {
    ...input,
    project: { ...project, items: [{ ...project.items[0]!, numbering: { restartAt: 3 } }] },
  };
  act(() => root.render(<Harness />));
  await act(async () => release());
  await expect(flushed).resolves.toMatchObject({
    updatedAt: 3,
    items: [{ numbering: { restartAt: 3 } }],
  });
  expect(save).toHaveBeenCalledTimes(2);
  expect(input.onStatus).toHaveBeenLastCalledWith('saved');
  expect(input.busy.current).toBe(false);
});

it('preserves array ordering as a real edit when flushing', async () => {
  const project = createGuideProject('Guide', 'guide', 1);
  project.items = [createGuideStep('First', 'first'), createGuideStep('Second', 'second')];
  input = {
    ...input,
    saved: { current: project },
    project: { ...project, items: [...project.items].reverse() },
  };
  save.mockImplementation(async (source) => ({ ...source, updatedAt: 2 }));
  act(() => root.render(<Harness />));
  await expect(autosave.flushLatest()).resolves.toMatchObject({
    items: [{ id: 'second' }, { id: 'first' }],
  });
  expect(save).toHaveBeenCalledOnce();
});
