// @vitest-environment jsdom
const wakeCheckpoints = vi.hoisted(() => vi.fn());
vi.mock('../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({ wakeCheckpoints }),
}));
import { act, StrictMode, useEffect, useState } from 'react';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { reduceGuideHistory, useGuideHistory } from './history';
import { createScenarioProjectEntry } from '../../../composition/persistence/scenario/projects/entry';
import type { ScenarioProjectEntry } from '../../../composition/persistence/scenario/contracts';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/public';
const save = vi.hoisted(() => vi.fn());
const publication = vi.hoisted(() => ({ acquire: vi.fn(), release: vi.fn() }));
vi.mock('../../../composition/persistence/sync-capture/checkpoint-publication', () => ({
  acquireSyncCheckpointEdit: publication.acquire,
}));
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

let groupHistory: ReturnType<typeof useGuideHistory>;
let groupAutosave: ReturnType<typeof useGuideAutosave>;
function GroupHarness() {
  const [status, setStatus] = useState<'dirty' | 'saving' | 'saved' | 'failed' | 'conflict'>(
    'saved'
  );
  groupHistory = useGuideHistory({
    canEdit: () => true,
    onEdit: () => setStatus('dirty'),
    onFailure: () => setStatus('failed'),
  });
  const { reset } = groupHistory;
  useEffect(() => {
    reset(input.saved.current!.project);
  }, [reset]);
  groupAutosave = useGuideAutosave({
    ...input,
    project: groupHistory.project,
    actionId: groupHistory.actionId,
    closedCaptures: groupHistory.closedCaptures,
    onSealEdit: groupHistory.sealEdit,
    dirty: status === 'dirty',
    conflict: status === 'conflict',
    onStatus: setStatus,
    onPublish: groupHistory.publish,
  });
  return null;
}

function groupedStore() {
  const project = input.saved.current!.project;
  let entry: ScenarioProjectEntry = {
    id: project.id,
    project,
    workspaceRevision: 1,
    createdAt: 1,
    updatedAt: project.updatedAt,
  };
  save.mockImplementation(
    async (
      source: typeof project,
      options: { expectedRevision: number; historyActionId?: string }
    ) => {
      expect(options.expectedRevision).toBe(entry.workspaceRevision);
      entry = createScenarioProjectEntry({
        existing: entry,
        project: source,
        ...(options.historyActionId ? { historyActionId: options.historyActionId } : {}),
        updatedAt: entry.updatedAt + 1,
      });
      return { project: entry.project, workspaceRevision: entry.workspaceRevision };
    }
  );
  return () => entry;
}

it('saves final X before Y after a real maxWait intermediate and restores exact group boundaries', async () => {
  const stored = groupedStore();
  await act(async () => root.render(<GroupHarness />));
  for (
    let elapsed = 0;
    elapsed < GUIDE_AUTOSAVE_MAX_WAIT_MS;
    elapsed += GUIDE_AUTOSAVE_IDLE_MS - 1
  ) {
    const name = `A-${elapsed}`;
    await act(async () => {
      groupHistory.update({ ...groupHistory.project!, name }, 'name');
    });
    await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS - 1));
  }
  expect(save).toHaveBeenCalledOnce();
  const firstAction = save.mock.calls[0]![1].historyActionId;
  expect(firstAction).toEqual(expect.any(String));
  await act(async () => {
    groupHistory.update({ ...groupHistory.project!, name: 'Final X' }, 'name');
  });
  await act(async () => {
    groupHistory.update({ ...groupHistory.project!, tags: ['Y'] }, 'tags');
  });
  await act(async () => {
    expect(await groupAutosave.save()).toBe(true);
  });
  expect(stored().history?.map((version) => version.project.name)).toEqual(['Guide', 'Final X']);
  expect(stored().history?.at(-1)?.project.tags).toEqual([]);
  expect(stored().project.tags).toEqual(['Y']);
  expect(save.mock.calls.map((call) => call[1].historyActionId)).toEqual([
    firstAction,
    firstAction,
    expect.any(String),
  ]);
  expect(save.mock.calls[2]![1].historyActionId).not.toBe(firstAction);
});

it('keeps two closed groups page-local with autosave OFF and serves them in order on explicit Save', async () => {
  input = { ...input, enabled: false };
  const stored = groupedStore();
  await act(async () => root.render(<GroupHarness />));
  await act(async () => {
    groupHistory.update({ ...groupHistory.project!, name: 'Final X' }, 'name');
  });
  await act(async () => {
    groupHistory.update({ ...groupHistory.project!, tags: ['Y'] }, 'tags');
  });
  await act(async () => vi.advanceTimersByTimeAsync(2 * GUIDE_AUTOSAVE_MAX_WAIT_MS));
  expect(save).not.toHaveBeenCalled();
  await act(async () => {
    expect(await groupAutosave.save()).toBe(true);
  });
  expect(stored().history?.map((version) => version.project.name)).toEqual(['Guide', 'Final X']);
  expect(stored().project.tags).toEqual(['Y']);
});

it('closes a manual Save group before await and preserves a newer field action while its write is held', async () => {
  input = { ...input, enabled: false };
  const stored = groupedStore();
  const commit = save.getMockImplementation()!;
  let release: () => void = () => undefined;
  save.mockImplementationOnce(
    (source, options) =>
      new Promise((resolve, reject) => {
        release = () => {
          void commit(source, options).then(resolve, reject);
        };
      })
  );
  await act(async () => root.render(<GroupHarness />));
  await act(async () => {
    groupHistory.update({ ...groupHistory.project!, name: 'A' }, 'name');
  });
  const firstId = groupHistory.actionId;
  let saved: Promise<boolean> | undefined;
  await act(async () => {
    saved = groupAutosave.save();
  });
  await act(async () => {
    groupHistory.update({ ...groupHistory.project!, name: 'AB' }, 'name');
  });
  const newerId = groupHistory.actionId;
  expect(newerId).not.toBe(firstId);
  await act(async () => {
    release();
    expect(await saved).toBe(true);
  });
  expect(groupHistory.project?.name).toBe('AB');
  expect(groupHistory.actionId).toBe(newerId);
  await act(async () => {
    expect(await groupAutosave.save()).toBe(true);
  });
  expect(save.mock.calls.map((call) => call[1].historyActionId)).toEqual([firstId, newerId]);
  expect(stored().history?.map((version) => version.project.name)).toEqual(['Guide', 'A']);
});

it('keeps an ordinary latest barrier inside the same group while manual Save closes it', async () => {
  const stored = groupedStore();
  await act(async () => root.render(<GroupHarness />));
  await act(async () => {
    groupHistory.update({ ...groupHistory.project!, name: 'A' }, 'name');
  });
  const id = groupHistory.actionId;
  await act(async () => {
    expect(await groupAutosave.flushLatest()).toMatchObject({ name: 'A' });
  });
  await act(async () => {
    groupHistory.update({ ...groupHistory.project!, name: 'AB' }, 'name');
  });
  expect(groupHistory.actionId).toBe(id);
  await act(async () => {
    expect(await groupAutosave.flushLatest()).toMatchObject({ name: 'AB' });
  });
  expect(stored().history?.map((version) => version.project.name)).toEqual(['Guide']);
  await act(async () => {
    expect(await groupAutosave.save()).toBe(true);
  });
  await act(async () => {
    groupHistory.update({ ...groupHistory.project!, name: 'ABC' }, 'name');
  });
  expect(groupHistory.actionId).not.toBe(id);
  await act(async () => {
    expect(await groupAutosave.save()).toBe(true);
  });
  expect(stored().history?.map((version) => version.project.name)).toEqual(['Guide', 'AB']);
});
beforeEach(() => {
  wakeCheckpoints.mockReset().mockResolvedValue({ kind: 'checkpoint-woken' });
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  save.mockReset();
  publication.release.mockReset().mockResolvedValue(undefined);
  publication.acquire.mockReset().mockResolvedValue({ release: publication.release });
  const base = createGuideProject('Guide', 'guide', 1);
  input = {
    project: { ...base, name: 'Edited' },
    dirty: true,
    conflict: false,
    protectUnsaved: true,
    saved: { current: { project: base, workspaceRevision: 1 } },
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

it('admits the captured owner revision and keeps the exact nonconsecutive returned revision', async () => {
  const base = createGuideProject('Versioned', 'guide', 1);
  input.saved.current = { project: base, workspaceRevision: 17 };
  const committed = { project: { ...input.project!, updatedAt: 2 }, workspaceRevision: 37 };
  save.mockResolvedValueOnce(committed);
  act(() => root.render(<Harness />));
  await act(async () => expect(await autosave.save()).toBe(true));
  expect(save).toHaveBeenLastCalledWith(input.project, { expectedRevision: 17 });
  expect(input.saved.current).toBe(committed);
  expect(input.onPublish).toHaveBeenCalledWith(committed.project, input.project);

  input = { ...input, project: { ...committed.project, name: 'Next owner revision' } };
  save.mockResolvedValueOnce({
    project: { ...input.project!, updatedAt: 3 },
    workspaceRevision: 59,
  });
  act(() => root.render(<Harness />));
  await act(async () => expect(await autosave.save()).toBe(true));
  expect(save).toHaveBeenLastCalledWith(input.project, { expectedRevision: 37 });
  expect(input.saved.current?.workspaceRevision).toBe(59);
});

it('does not acquire a manual writer for the unchanged canonical UI projection', async () => {
  const source = createGuideProject('Guide', 'guide', 1);
  source.items = [createGuideStep('Step', 'step')];
  const project = structuredClone({ ...source, updatedAt: 2 });
  const committed = { project, workspaceRevision: 37 };
  const state = reduceGuideHistory(
    { present: source, past: [], future: [], group: null },
    {
      kind: 'publish',
      source,
      project,
    }
  );
  input = { ...input, project: state.present, dirty: false, protectUnsaved: false };
  input.saved.current = committed;
  save.mockResolvedValue(committed);
  act(() => root.render(<Harness />));
  await act(async () => expect(await autosave.save()).toBe(true));
  expect(save).not.toHaveBeenCalled();
  expect(input.saved.current).toBe(committed);
  expect(input.onStatus).toHaveBeenCalledWith('saved');
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
        finish = () => resolve({ project: { ...project, updatedAt: 2 }, workspaceRevision: 2 });
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
  expect(input.saved.current?.project.name).toBe('Guide');
  expect(input.busy.current).toBe(false);
});

it('cancels queued autosave, protects paused edits on unload and resumes the latest value', async () => {
  save.mockImplementation(async (project) => ({
    project: { ...project, updatedAt: 2 },
    workspaceRevision: 2,
  }));
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
    expectedRevision: 1,
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

it('keeps manual save and latest flush available while automatic saving is disabled', async () => {
  input = { ...input, enabled: false };
  save.mockImplementation(async (source) => ({
    project: { ...source, updatedAt: 2 },
    workspaceRevision: 2,
  }));
  act(() => root.render(<Harness />));
  await expect(autosave.save()).resolves.toBe(true);
  input = { ...input, project: { ...input.project!, name: 'Explicit paused edit' } };
  act(() => root.render(<Harness />));
  await expect(autosave.flushLatest()).resolves.toMatchObject({ name: 'Explicit paused edit' });
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_MAX_WAIT_MS));
  expect(save).toHaveBeenCalledTimes(2);
});

it('retains external admission ownership and retries explicitly after the gate becomes free', async () => {
  input.busy.current = true;
  save.mockImplementation(async (source) => ({
    project: { ...source, updatedAt: 2 },
    workspaceRevision: 2,
  }));
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_MAX_WAIT_MS * 2));
  expect(save).not.toHaveBeenCalled();
  expect(input.busy.current).toBe(true);
  expect(input.autosaving.current).toBe(false);
  await expect(autosave.flushLatest()).resolves.toBeNull();
  input.busy.current = false;
  await expect(autosave.flushLatest()).resolves.toMatchObject({ name: 'Edited' });
  expect(save).toHaveBeenCalledOnce();
});

it('creates a fresh coordinator after StrictMode effect cleanup', async () => {
  save.mockImplementation(async (source) => ({
    project: { ...source, updatedAt: 2 },
    workspaceRevision: 2,
  }));
  act(() =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>
    )
  );
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  expect(save).toHaveBeenCalledOnce();
  expect(input.onPublish).toHaveBeenCalledOnce();
});

it('does not acknowledge an acquired write after unmount even without a generation change', async () => {
  let release: () => void = () => undefined;
  save.mockImplementationOnce(
    (source) =>
      new Promise((resolve) => {
        release = () => resolve({ project: { ...source, updatedAt: 2 }, workspaceRevision: 2 });
      })
  );
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  act(() => root.render(null));
  await act(async () => release());
  expect(input.onPublish).not.toHaveBeenCalled();
  expect(input.saved.current?.project.name).toBe('Guide');
  expect(input.busy.current).toBe(false);
  expect(input.autosaving.current).toBe(false);
});

it('rejects a foreign acknowledgement when project changes without a generation change', async () => {
  let release: () => void = () => undefined;
  save.mockImplementationOnce(
    (source) =>
      new Promise((resolve) => {
        release = () => resolve({ project: { ...source, updatedAt: 2 }, workspaceRevision: 2 });
      })
  );
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  const other = createGuideProject('Other', 'other', 3);
  input = { ...input, project: other, dirty: false };
  input.saved.current = { project: other, workspaceRevision: 3 };
  act(() => root.render(<Harness />));
  await act(async () => release());
  expect(input.saved.current?.project).toBe(other);
  expect(input.onPublish).not.toHaveBeenCalled();
});

it('coalesces phrase typing instead of writing after each short pause', async () => {
  save.mockImplementation(async (project) => ({
    project: { ...project, updatedAt: Date.now() },
    workspaceRevision: 2,
  }));
  for (const name of ['A', 'AB', 'ABC', 'ABCD']) {
    input = { ...input, project: { ...input.project!, name } };
    act(() => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTimeAsync(400));
  }
  expect(save).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'ABCD' }), {
    expectedRevision: 1,
  });
});

it('bounds continuous typing and writes the latest value without waiting for blur', async () => {
  save.mockImplementation(async (project) => ({
    project: { ...project, updatedAt: Date.now() },
    workspaceRevision: 2,
  }));
  for (let elapsed = 0; elapsed < GUIDE_AUTOSAVE_MAX_WAIT_MS; elapsed += 100) {
    input = { ...input, project: { ...input.project!, name: `Typed ${elapsed}` } };
    act(() => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTimeAsync(100));
  }
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ name: `Typed ${GUIDE_AUTOSAVE_MAX_WAIT_MS - 100}` }),
    { expectedRevision: 1 }
  );
});

it('flushes the latest draft after an older pending write using its acknowledged revision', async () => {
  let release!: () => void;
  save.mockImplementationOnce(
    (source) =>
      new Promise((resolve) => {
        release = () => resolve({ project: { ...source, updatedAt: 2 }, workspaceRevision: 2 });
      })
  );
  save.mockImplementation(async (source) => ({
    project: { ...source, updatedAt: 3 },
    workspaceRevision: 3,
  }));
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  input = { ...input, project: { ...input.project!, name: 'Latest draft' } };
  act(() => root.render(<Harness />));
  const flush = autosave.flushLatest();
  await act(async () => release());
  await expect(flush).resolves.toMatchObject({ name: 'Latest draft', updatedAt: 3 });
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Latest draft' }), {
    expectedRevision: 2,
  });
});

it('retains the newer autosave deadline when an older acknowledgement rebases its timestamp', async () => {
  let release: () => void = () => undefined;
  save
    .mockImplementationOnce(
      (source) =>
        new Promise((resolve) => {
          release = () => resolve({ project: { ...source, updatedAt: 2 }, workspaceRevision: 2 });
        })
    )
    .mockImplementation(async (source) => ({
      project: { ...source, updatedAt: 3 },
      workspaceRevision: 3,
    }));
  input.onPublish = (committed, source) => {
    const history = reduceGuideHistory(
      { present: input.project, past: [], future: [], group: null },
      { kind: 'publish', project: committed, source }
    );
    input = { ...input, project: history.present };
    act(() => root.render(<Harness />));
  };
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  input = { ...input, project: { ...input.project!, name: 'Newer ready draft' } };
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => release());
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Newer ready draft' }), {
    expectedRevision: 2,
  });
});

it('coalesces uncaptured intermediate edits behind one acquired write', async () => {
  let release: () => void = () => undefined;
  save
    .mockImplementationOnce(
      (source) =>
        new Promise((resolve) => {
          release = () => resolve({ project: { ...source, updatedAt: 2 }, workspaceRevision: 2 });
        })
    )
    .mockImplementation(async (source) => ({
      project: { ...source, updatedAt: 3 },
      workspaceRevision: 3,
    }));
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  input = { ...input, project: { ...input.project!, name: 'Obsolete queued edit' } };
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  input = { ...input, project: { ...input.project!, name: 'Latest queued edit' } };
  act(() => root.render(<Harness />));
  await act(async () => release());
  expect(save).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Latest queued edit' }), {
    expectedRevision: 2,
  });
});

it('does not let a late conflict stop a new A/B/A session', async () => {
  let reject: (error: Error) => void = () => undefined;
  save
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    )
    .mockImplementation(async (source) => ({
      project: { ...source, updatedAt: 5 },
      workspaceRevision: 5,
    }));
  act(() => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  const other = createGuideProject('Other', 'other', 3);
  input = { ...input, project: other, dirty: false };
  input.saved.current = { project: other, workspaceRevision: 3 };
  act(() => root.render(<Harness />));
  const base = createGuideProject('Reopened A', 'guide', 4);
  input = { ...input, project: { ...base, name: 'New A edit' }, dirty: true };
  input.saved.current = { project: base, workspaceRevision: 4 };
  act(() => root.render(<Harness />));
  const conflict = new Error('Old A conflict');
  conflict.name = 'StaleScenarioAggregateRevisionError';
  await act(async () => reject(conflict));
  expect(input.onStatus).not.toHaveBeenCalledWith('conflict');
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'New A edit' }), {
    expectedRevision: 4,
  });
  expect(input.saved.current?.project.name).toBe('New A edit');
});

it('keeps a failed draft for explicit retry and does not flush a conflict', async () => {
  save.mockRejectedValueOnce(new Error('Quota'));
  act(() => root.render(<Harness />));
  await expect(autosave.flushLatest()).resolves.toBeNull();
  expect(input.saved.current?.project.name).toBe('Guide');
  expect(input.onStatus).toHaveBeenLastCalledWith('failed');
  save.mockImplementation(async (source) => ({
    project: { ...source, updatedAt: 2 },
    workspaceRevision: 2,
  }));
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
        release = () => resolve({ project: { ...source, updatedAt: 2 }, workspaceRevision: 2 });
      })
  );
  act(() => root.render(<Harness />));
  let flushed!: ReturnType<typeof autosave.flushLatest>;
  await act(async () => {
    flushed = autosave.flushLatest();
  });
  input.generation.current += 1;
  input = { ...input, project: createGuideProject('Other', 'other', 3) };
  act(() => root.render(<Harness />));
  await act(async () => release());
  await expect(flushed).resolves.toBeNull();
  expect(save).toHaveBeenCalledOnce();
  expect(input.saved.current?.project.id).toBe('guide');
});

it('recognizes its own committed source when persistence returns a different property order', async () => {
  const { name, ...rest } = input.project!;
  const committed = { name, ...rest, updatedAt: 2 };
  save
    .mockResolvedValueOnce({ project: committed, workspaceRevision: 2 })
    .mockRejectedValueOnce(new Error('Duplicate write'));
  act(() => root.render(<Harness />));
  await expect(autosave.flushLatest()).resolves.toEqual(committed);
  expect(save).toHaveBeenCalledOnce();
});

it('does not reuse a source acknowledgement after another mutation replaces the saved authority', async () => {
  save.mockImplementation(async (source) => ({
    project: { ...source, updatedAt: 2 },
    workspaceRevision: 2,
  }));
  act(() => root.render(<Harness />));
  await autosave.flushLatest();
  input.saved.current = {
    project: { ...input.saved.current!.project, name: 'Imported project change', updatedAt: 3 },
    workspaceRevision: 3,
  };
  await autosave.flushLatest();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(input.project, { expectedRevision: 3 });
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
          resolve({ project: parsed.project, workspaceRevision: 2 });
        };
      })
  );
  save.mockImplementationOnce(async (source) => {
    const parsed = parseGuideProject({ ...source, updatedAt: 3 });
    if (parsed.status !== 'ok') throw new Error('Invalid fixture');
    return { project: parsed.project, workspaceRevision: 3 };
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
  let flushed!: ReturnType<typeof autosave.flushLatest>;
  await act(async () => {
    flushed = autosave.flushLatest();
  });
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
    saved: { current: { project, workspaceRevision: 1 } },
    project: { ...project, items: [...project.items].reverse() },
  };
  save.mockImplementation(async (source) => ({
    project: { ...source, updatedAt: 2 },
    workspaceRevision: 2,
  }));
  act(() => root.render(<Harness />));
  await expect(autosave.flushLatest()).resolves.toMatchObject({
    items: [{ id: 'second' }, { id: 'first' }],
  });
  expect(save).toHaveBeenCalledOnce();
});

it('acknowledges closed captures before React publishes the next render', async () => {
  const base = input.saved.current!.project;
  const x = { ...base, name: 'Closed X' };
  const y = { ...x, tags: ['Y'] };
  let writes = 0;
  save.mockImplementation(async (project) => {
    if (++writes > 2) throw new Error('Closed capture repeated');
    return { project: { ...project, updatedAt: 100 + writes }, workspaceRevision: 1 + writes };
  });
  input = {
    ...input,
    project: y,
    actionId: '22222222-2222-4222-8222-222222222222',
    dirty: true,
    closedCaptures: [{ project: x, actionId: '11111111-1111-4111-8111-111111111111' }],
    onPublish: vi.fn(),
  };
  act(() => root.render(<Harness />));
  await expect(autosave.flushLatest()).resolves.toMatchObject({ name: 'Closed X', tags: ['Y'] });
  expect(save).toHaveBeenCalledTimes(2);
});

it('keeps intermediate native saves protected until held pointer ends and latest ACK arrives', async () => {
  save.mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  await act(async () => root.render(<Harness />));
  act(() => autosave.beginInteraction(7));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_MAX_WAIT_MS));
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledOnce();
  expect(publication.release).not.toHaveBeenCalled();
  let acknowledge!: (value: NonNullable<typeof input.saved.current>) => void;
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      })
  );
  input = { ...input, project: { ...input.project!, name: 'Final' } };
  await act(async () => root.render(<Harness />));
  await act(async () => {
    autosave.endInteraction(7);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(save).toHaveBeenCalledTimes(2);
  expect(publication.release).not.toHaveBeenCalled();
  await act(async () => acknowledge({ project: input.project!, workspaceRevision: 3 }));
  expect(publication.release).toHaveBeenCalledOnce();
});

it('waits for publication grant outside mutation admission and refuses stale generation', async () => {
  let grant!: (value: { release(): Promise<void> }) => void;
  publication.acquire.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      })
  );
  await act(async () => root.render(<Harness />));
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = autosave.save();
  });
  expect(input.busy.current).toBe(false);
  expect(save).not.toHaveBeenCalled();
  input.generation.current += 1;
  await act(async () => {
    grant({ release: publication.release });
    await pending;
  });
  expect(save).not.toHaveBeenCalled();
  expect(publication.release).toHaveBeenCalledOnce();
});

it('retains publication protection after final failure and releases on explicit retry', async () => {
  save
    .mockRejectedValueOnce(new Error('disk'))
    .mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  await act(async () => root.render(<Harness />));
  await act(async () => {
    expect(await autosave.save()).toBe(false);
  });
  expect(publication.release).not.toHaveBeenCalled();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  await act(async () => {
    expect(await autosave.save()).toBe(true);
  });
  expect(publication.release).toHaveBeenCalledOnce();
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
});

it('finishes typing at idle without holding the focused field until blur', async () => {
  save.mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  await act(async () => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  expect(save).toHaveBeenCalledOnce();
  expect(publication.release).toHaveBeenCalledOnce();
});

it('does not release a newer held gesture when an older final save acknowledges', async () => {
  let acknowledge!: (value: NonNullable<typeof input.saved.current>) => void;
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      })
  );
  await act(async () => root.render(<Harness />));
  let first!: Promise<boolean>;
  await act(async () => {
    first = autosave.save();
  });
  act(() => {
    autosave.beginInteraction(8);
    autosave.beginEdit();
  });
  input = { ...input, project: { ...input.project!, name: 'Newer gesture' } };
  await act(async () => root.render(<Harness />));
  await act(async () => {
    acknowledge({ project: { ...input.project!, name: 'Older' }, workspaceRevision: 2 });
    await first;
  });
  expect(publication.release).not.toHaveBeenCalled();
  save.mockImplementation(async (project) => ({ project, workspaceRevision: 3 }));
  await act(async () => {
    autosave.endInteraction(8);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(publication.release).toHaveBeenCalledOnce();
});

it('releases teardown protection only after the admitted native writer settles', async () => {
  let acknowledge!: (value: NonNullable<typeof input.saved.current>) => void;
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      })
  );
  await act(async () => root.render(<Harness />));
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = autosave.save();
  });
  act(() => root.render(null));
  expect(publication.release).not.toHaveBeenCalled();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  await act(async () => {
    acknowledge({ project: input.project!, workspaceRevision: 2 });
    await saving;
  });
  expect(publication.release).toHaveBeenCalledOnce();
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
});

it('refuses unavailable coordination and reacquires protection on explicit retry', async () => {
  publication.acquire.mockRejectedValueOnce(new Error('coordination'));
  input = { ...input, enabled: false };
  save.mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  await act(async () => root.render(<Harness />));
  await act(async () => {
    expect(await autosave.save()).toBe(false);
  });
  expect(save).not.toHaveBeenCalled();
  expect(input.onStatus).toHaveBeenLastCalledWith('failed');
  await act(async () => {
    expect(await autosave.save()).toBe(true);
  });
  expect(publication.acquire).toHaveBeenCalledTimes(2);
  expect(publication.release).toHaveBeenCalledOnce();
});

it('retains protection when autosave is disabled after an intermediate native write', async () => {
  save.mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  await act(async () => root.render(<Harness />));
  act(() => autosave.beginInteraction(9));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_MAX_WAIT_MS));
  input = { ...input, enabled: false, project: { ...input.project!, name: 'Final disabled' } };
  await act(async () => root.render(<Harness />));
  await act(async () => {
    autosave.endInteraction(9);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(publication.release).not.toHaveBeenCalled();
  await act(async () => {
    expect(await autosave.save()).toBe(true);
  });
  expect(publication.release).toHaveBeenCalledOnce();
});

it('releases a late grant after teardown without starting a native writer', async () => {
  let grant!: (value: { release(): Promise<void> }) => void;
  publication.acquire.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      })
  );
  await act(async () => root.render(<Harness />));
  act(() => root.render(null));
  expect(publication.release).not.toHaveBeenCalled();
  await act(async () => grant({ release: publication.release }));
  expect(save).not.toHaveBeenCalled();
  expect(publication.release).toHaveBeenCalledOnce();
});

it('waits for downstream DOM pointerup commits before saving the completed gesture', async () => {
  save.mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  await act(async () => root.render(<Harness />));
  act(() => autosave.beginInteraction(17));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  expect(save).toHaveBeenCalledOnce();
  expect(publication.release).not.toHaveBeenCalled();
  const field = document.createElement('input');
  document.body.append(field);
  let committed!: () => void;
  const downstreamCommitted = new Promise<void>((resolve) => {
    committed = resolve;
  });
  field.addEventListener('pointerup', () => {
    queueMicrotask(() => {
      act(() => {
        autosave.beginEdit();
        input = { ...input, project: { ...input.project!, name: 'Downstream final' } };
        root.render(<Harness />);
      });
      committed();
    });
  });
  const event = new Event('pointerup', { bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 17 });
  await act(async () => {
    field.dispatchEvent(event);
    await downstreamCommitted;
  });
  expect(publication.release).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls.at(-1)![0].name).toBe('Downstream final');
  expect(publication.release).toHaveBeenCalledOnce();
  field.remove();
});

it('keeps a replacement pointer gesture protected from the old completion task', async () => {
  save.mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  await act(async () => root.render(<Harness />));
  act(() => autosave.beginInteraction(18));
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
  act(() => {
    autosave.endInteraction(18);
    autosave.beginInteraction(18);
    autosave.beginEdit();
  });
  input = { ...input, project: { ...input.project!, name: 'Replacement pointer' } };
  await act(async () => root.render(<Harness />));
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(save).toHaveBeenCalledOnce();
  expect(publication.release).not.toHaveBeenCalled();
  await act(async () => {
    autosave.endInteraction(18);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(save.mock.calls.at(-1)![0].name).toBe('Replacement pointer');
  expect(publication.release).toHaveBeenCalledOnce();
});

it('wakes Scenario only after its accepted publication release settles', async () => {
  let finishRelease!: () => void;
  publication.release.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishRelease = resolve;
      })
  );
  save.mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  await act(async () => root.render(<Harness />));
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = autosave.save();
  });
  expect(publication.release).toHaveBeenCalledOnce();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  await act(async () => {
    finishRelease();
    expect(await saving).toBe(true);
  });
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
});

it('does not wake Scenario when an acquired edit has no native changes', async () => {
  input = { ...input, project: input.saved.current!.project, dirty: false };
  await act(async () => root.render(<Harness />));
  act(() => autosave.beginEdit());
  await act(async () => expect(await autosave.save()).toBe(true));
  expect(publication.release).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
});

it('keeps Scenario saved after advisory wake rejection', async () => {
  wakeCheckpoints.mockRejectedValueOnce(new Error('Worker unavailable'));
  save.mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  await act(async () => root.render(<Harness />));
  await act(async () => expect(await autosave.save()).toBe(true));
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
  expect(input.onStatus).toHaveBeenLastCalledWith('saved');
  expect(publication.release).toHaveBeenCalledOnce();
});

function nativeExitReceipt(rootId = input.project!.id) {
  return { rootKind: 'scenario-project' as const, rootId, revision: crypto.randomUUID() };
}
async function prepareExitAfterDispatch() {
  let preparing!: ReturnType<typeof autosave.prepareCheckpointExit>;
  await act(async () => {
    preparing = autosave.prepareCheckpointExit();
    await vi.advanceTimersByTimeAsync(0);
  });
  return preparing;
}

it('prepares a Scenario exit witness from its exact native ACK and retains it through a local no-op', async () => {
  const token = nativeExitReceipt();
  save.mockImplementation(async (project) => ({
    project,
    workspaceRevision: 2,
    checkpointReceipt: token,
  }));
  await act(async () => root.render(<Harness />));
  const witness = await prepareExitAfterDispatch();
  expect(witness?.receipt).toEqual(token);
  expect(witness?.isCurrent()).toBe(true);
  expect(save).toHaveBeenCalledOnce();
  expect((await prepareExitAfterDispatch())?.receipt).toEqual(token);
  expect(save).toHaveBeenCalledOnce();
});

it('waits for an ended pointer dispatch before preparing the latest Scenario exit witness', async () => {
  save.mockImplementation(async (project) => ({
    project,
    workspaceRevision: input.saved.current!.workspaceRevision + 1,
    checkpointReceipt: nativeExitReceipt(),
  }));
  await act(async () => root.render(<Harness />));
  act(() => autosave.beginInteraction(71));
  act(() => {
    autosave.endInteraction(71);
    autosave.beginEdit();
    input = { ...input, project: { ...input.project!, name: 'Pointerup final' } };
    root.render(<Harness />);
  });
  // Navigation runs before the incumbent endInteraction task removes the pointer.
  const witness = await prepareExitAfterDispatch();
  expect(witness?.isCurrent()).toBe(true);
  expect(witness?.receipt?.rootId).toBe(input.project!.id);
  expect(save.mock.calls.at(-1)![0].name).toBe('Pointerup final');
});

it('refuses a true held Scenario pointer without invoking a native exit save', async () => {
  await act(async () => root.render(<Harness />));
  act(() => autosave.beginInteraction(72));
  expect(await prepareExitAfterDispatch()).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

it('refuses a new pointer start and end during the post-dispatch exit wait', async () => {
  await act(async () => root.render(<Harness />));
  let preparing!: ReturnType<typeof autosave.prepareCheckpointExit>;
  await act(async () => {
    preparing = autosave.prepareCheckpointExit();
    autosave.beginInteraction(73);
    autosave.endInteraction(73);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(await preparing).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

it('clears a Scenario receipt on native ACK omission and does not borrow a replacement saved snapshot', async () => {
  save
    .mockImplementationOnce(async (project) => ({
      project,
      workspaceRevision: 2,
      checkpointReceipt: nativeExitReceipt(),
    }))
    .mockImplementation(async (project) => ({ project, workspaceRevision: 3 }));
  await act(async () => root.render(<Harness />));
  expect((await prepareExitAfterDispatch())?.receipt).not.toBeNull();
  input = { ...input, project: { ...input.project!, name: 'Native omission' } };
  await act(async () => root.render(<Harness />));
  const omitted = await prepareExitAfterDispatch();
  expect(omitted?.receipt).toBeNull();
  expect(omitted?.isCurrent()).toBe(true);
  input.saved.current = { ...input.saved.current!, checkpointReceipt: nativeExitReceipt() };
  expect(omitted?.isCurrent()).toBe(false);
  expect((await prepareExitAfterDispatch())?.receipt).toBeNull();
});

it.each([
  'edit',
  'rebind',
  'dispose',
  'pointer-cycle',
  'closed-action',
  'source-content',
  'saved-revision',
] as const)(
  'invalidates a Scenario exit witness after %s during an awaited intent',
  async (change) => {
    save.mockImplementation(async (project) => ({
      project,
      workspaceRevision: 2,
      checkpointReceipt: nativeExitReceipt(),
    }));
    await act(async () => root.render(<Harness />));
    const witness = await prepareExitAfterDispatch();
    expect(witness?.isCurrent()).toBe(true);
    await act(async () => {
      if (change === 'edit') {
        autosave.beginEdit();
        input = { ...input, project: { ...input.project!, name: 'Newer intent-gap edit' } };
        root.render(<Harness />);
      }
      if (change === 'rebind') {
        input.generation.current += 1;
        root.render(<Harness />);
      }
      if (change === 'dispose') root.render(null);
      if (change === 'pointer-cycle') {
        autosave.beginInteraction(74);
        autosave.endInteraction(74);
        await vi.advanceTimersByTimeAsync(0);
      }
      if (change === 'closed-action') {
        input = {
          ...input,
          closedCaptures: [{ project: input.project!, actionId: crypto.randomUUID() }],
        };
        root.render(<Harness />);
      }
      if (change === 'source-content') input.project!.name = 'Changed outside a rendered revision';
      if (change === 'saved-revision')
        input.saved.current = { ...input.saved.current!, workspaceRevision: 9 };
    });
    expect(witness?.isCurrent()).toBe(false);
  }
);

it.each(['edit', 'rebind', 'dispose', 'pointer-cycle'] as const)(
  'refuses Scenario exit preparation when %s arrives during the native save barrier',
  async (change) => {
    let finish!: () => void;
    save.mockImplementationOnce(
      (project) =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              project,
              workspaceRevision: 2,
              checkpointReceipt: nativeExitReceipt(project.id),
            });
        })
    );
    await act(async () => root.render(<Harness />));
    let preparing!: ReturnType<typeof autosave.prepareCheckpointExit>;
    await act(async () => {
      preparing = autosave.prepareCheckpointExit();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(save).toHaveBeenCalledOnce();
    await act(async () => {
      if (change === 'edit') {
        autosave.beginEdit();
        input = { ...input, project: { ...input.project!, name: 'Newer barrier edit' } };
        root.render(<Harness />);
      }
      if (change === 'rebind') {
        input.generation.current += 1;
        root.render(<Harness />);
      }
      if (change === 'dispose') root.render(null);
      if (change === 'pointer-cycle') {
        autosave.beginInteraction(75);
        autosave.endInteraction(75);
        await vi.advanceTimersByTimeAsync(0);
      }
      finish();
    });
    expect(await preparing).toBeNull();
  }
);

it.each(['foreign-root', 'foreign-kind', 'malformed', 'omitted'] as const)(
  'omits a Scenario exit receipt for a %s native ACK',
  async (kind) => {
    const token = nativeExitReceipt();
    const checkpointReceipt =
      kind === 'foreign-root'
        ? { ...token, rootId: 'other-project' }
        : kind === 'foreign-kind'
          ? { ...token, rootKind: 'media' }
          : kind === 'malformed'
            ? { ...token, revision: 'invalid' }
            : undefined;
    save.mockImplementation(async (project) => ({
      project,
      workspaceRevision: 2,
      ...(checkpointReceipt ? { checkpointReceipt } : {}),
    }));
    await act(async () => root.render(<Harness />));
    const witness = await prepareExitAfterDispatch();
    expect(witness?.isCurrent()).toBe(true);
    expect(witness?.receipt).toBeNull();
  }
);

it('does not borrow a receipt from a loaded Scenario snapshot without this writer acknowledgement', async () => {
  const committed = { ...input.saved.current!, checkpointReceipt: nativeExitReceipt() };
  input = { ...input, project: committed.project, dirty: false, saved: { current: committed } };
  await act(async () => root.render(<Harness />));
  const witness = await prepareExitAfterDispatch();
  expect(witness?.isCurrent()).toBe(true);
  expect(witness?.receipt).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

it('keeps explicit Scenario exit flushing available when automatic saving is disabled', async () => {
  input = { ...input, enabled: false };
  save.mockImplementation(async (project) => ({
    project,
    workspaceRevision: 2,
    checkpointReceipt: nativeExitReceipt(),
  }));
  await act(async () => root.render(<Harness />));
  const witness = await prepareExitAfterDispatch();
  expect(witness?.isCurrent()).toBe(true);
  expect(witness?.receipt).not.toBeNull();
  expect(save).toHaveBeenCalledOnce();
});

it('returns no Scenario exit witness after a failed native save', async () => {
  save.mockRejectedValueOnce(new Error('Cannot save Scenario'));
  await act(async () => root.render(<Harness />));
  expect(await prepareExitAfterDispatch()).toBeNull();
  expect(input.onStatus).toHaveBeenLastCalledWith('failed');
});

it('refuses a new Scenario keyboard edit during the post-dispatch exit task', async () => {
  await act(async () => root.render(<Harness />));
  let preparing!: ReturnType<typeof autosave.prepareCheckpointExit>;
  await act(async () => {
    preparing = autosave.prepareCheckpointExit();
    autosave.beginEdit();
    input = { ...input, project: { ...input.project!, name: 'Keyboard edit during exit task' } };
    root.render(<Harness />);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(await preparing).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

it('prepares a Scenario exit after all retained closed captures are natively acknowledged', async () => {
  const first = { ...input.project!, name: 'Closed first' };
  const final = { ...first, name: 'Closed final' };
  const firstAction = crypto.randomUUID();
  const finalAction = crypto.randomUUID();
  input = {
    ...input,
    project: final,
    actionId: finalAction,
    closedCaptures: [
      { project: first, actionId: firstAction },
      { project: final, actionId: finalAction },
    ],
  };
  save.mockImplementation(async (project) => ({
    project,
    workspaceRevision: input.saved.current!.workspaceRevision + 1,
    checkpointReceipt: nativeExitReceipt(project.id),
  }));
  await act(async () => root.render(<Harness />));
  const witness = await prepareExitAfterDispatch();
  expect(witness?.isCurrent()).toBe(true);
  expect(witness?.receipt).toEqual(input.saved.current?.checkpointReceipt);
  expect(save.mock.calls.map(([project]) => project.name)).toEqual([
    'Closed first',
    'Closed final',
  ]);
});
