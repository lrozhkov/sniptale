// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
import type { useGuideAutosave } from './autosave';
import { useGuidePageState } from './use-state';

const io = vi.hoisted(() => ({ load: vi.fn(), autosave: vi.fn(), list: vi.fn(), enter: vi.fn() }));
vi.mock('../../../composition/persistence/scenario/store/public', async (original) => ({
  ...(await original<typeof import('../../../composition/persistence/scenario/store/public')>()),
  listScenarioProjectSummaries: io.list,
}));
vi.mock('./autosave', () => ({ useGuideAutosave: io.autosave }));
vi.mock('./resource-session', () => ({ useGuideResourceSession: () => enterSession }));
const enterSession = (id: string | null) => io.enter(id);
vi.mock('../../../composition/persistence/scenario/history', () => ({
  getScenarioSavedVersions: io.load,
}));
vi.mock('../../../composition/persistence/scenario/store/project-records/assets', () => ({
  getScenarioAssetBlob: async () => undefined,
}));
vi.mock('../../platform/browser-driver', () => ({ replaceScenarioEditorSelectionInUrl: vi.fn() }));

let state: ReturnType<typeof useGuidePageState>;
let autosave: Parameters<typeof useGuideAutosave>[0];
let root: Root;
let host: HTMLDivElement;
function Probe() {
  state = useGuidePageState();
  return (
    <textarea
      aria-label="Action text"
      disabled={state.editingLocked}
      value={state.project?.name ?? ''}
      onChange={(event) => {
        if (state.project) state.update({ ...state.project, name: event.target.value });
      }}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  io.enter.mockResolvedValue(true);
  io.list.mockResolvedValue([{ id: 'guide', availability: 'available' }]);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/?projectId=guide');
  const project = createGuideProject('Original', 'guide', 1);
  io.load.mockResolvedValue({
    currentRevision: 1,
    versions: [{ project, revision: 1, savedAt: 1 }],
  });
  io.autosave.mockImplementation((input: Parameters<typeof useGuideAutosave>[0]) => {
    autosave = input;
    return { save: async () => true, flushLatest: async () => input.project, flushEdits: () => {} };
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(<Probe />));
  const field = host.querySelector('textarea');
  if (!field) throw new Error('The action text field must be mounted.');
  act(() => field.focus());
  expect(document.activeElement).toBe(field);
  return field;
}
function input(field: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

it('keeps text enabled, focused and editable between autosave captures without an active writer', async () => {
  const field = await mount();
  act(() => {
    autosave.busy.current = false;
    autosave.autosaving.current = false;
    autosave.onStatus('saving');
  });
  expect(field.disabled).toBe(false);
  expect(document.activeElement).toBe(field);
  act(() => input(field, 'Instruction'));
  expect(state.project?.name).toBe('Instruction');
  expect(field.value).toBe('Instruction');
  expect(document.activeElement).toBe(field);
});

it('locks text while an exclusive mutation owns the writer and refuses edits', async () => {
  const field = await mount();
  act(() => {
    autosave.busy.current = true;
    autosave.autosaving.current = false;
    autosave.onStatus('saving');
  });
  expect(field.disabled).toBe(true);
  const project = state.project;
  if (!project) throw new Error('The guide must be loaded.');
  act(() => state.update({ ...project, name: 'Refused' }));
  expect(state.project).toBe(project);
  expect(field.value).toBe('Original');
});

it('keeps text enabled, focused and editable while the autosave writer is active', async () => {
  const field = await mount();
  act(() => {
    autosave.busy.current = true;
    autosave.autosaving.current = true;
    autosave.onStatus('saving');
  });
  expect(field.disabled).toBe(false);
  expect(document.activeElement).toBe(field);
  act(() => input(field, 'During autosave'));
  expect(state.project?.name).toBe('During autosave');
  expect(field.value).toBe('During autosave');
  expect(document.activeElement).toBe(field);
});

it('reports an unsupported stored tour without opening or replacing its source', async () => {
  io.load.mockResolvedValue(null);
  io.list.mockResolvedValue([{ id: 'guide', availability: 'unsupported' }]);
  await mount();
  expect(state.project).toBeNull();
  expect(state.status).toBe('unsupported');
  expect(autosave.project).toBeNull();
});

it('retains a dirty editor buffer when reload finds an unsupported stored tour', async () => {
  const field = await mount();
  act(() => input(field, 'Retain this draft'));
  const retained = state.project;
  io.load.mockResolvedValue(null);
  io.list.mockResolvedValue([{ id: 'guide', availability: 'unsupported' }]);
  await act(async () => state.reload());
  expect(state.project).toBe(retained);
  expect(state.project?.name).toBe('Retain this draft');
  expect(state.status).toBe('dirty');
  expect(state.actionError).toBe('reload');
});

it('explains unsupported storage when resource pruning refuses to open it', async () => {
  io.enter.mockRejectedValue(new Error('Unavailable guide cannot be pruned.'));
  io.list.mockResolvedValue([{ id: 'guide', availability: 'unsupported' }]);
  await mount();
  expect(state.project).toBeNull();
  expect(state.status).toBe('unsupported');
  expect(io.load).not.toHaveBeenCalled();
});

it('keeps a missing direct link distinct from an unsupported tour', async () => {
  io.load.mockResolvedValue(null);
  io.list.mockResolvedValue([]);
  await mount();
  expect(state.status).toBe('missing');
});

it('ignores delayed unsupported metadata after another project opens', async () => {
  let finishMetadata: ((value: { id: string; availability: string }[]) => void) | undefined;
  io.enter.mockRejectedValueOnce(new Error('Unavailable guide cannot be pruned.'));
  io.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishMetadata = resolve;
      })
  );
  await act(async () => root.render(<Probe />));
  expect(state.status).toBe('loading');
  const project = createGuideProject('Next project', 'next', 2);
  io.load.mockResolvedValue({
    currentRevision: 1,
    versions: [{ project, revision: 1, savedAt: 2 }],
  });
  io.list.mockResolvedValue([{ id: 'next', availability: 'available' }]);
  await act(async () => state.openExisting('next'));
  expect(state.project?.id).toBe('next');
  expect(state.status).toBe('saved');
  if (!finishMetadata) throw new Error('Missing delayed compatibility metadata.');
  await act(async () => finishMetadata!([{ id: 'guide', availability: 'unsupported' }]));
  expect(state.project?.id).toBe('next');
  expect(state.status).toBe('saved');
});
