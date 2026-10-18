// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
import type { useGuideAutosave } from './autosave';
import { useGuidePageState } from './use-state';

const io = vi.hoisted(() => ({ load: vi.fn(), autosave: vi.fn() }));
vi.mock('./autosave', () => ({ useGuideAutosave: io.autosave }));
vi.mock('./resource-session', () => ({ useGuideResourceSession: () => enterSession }));
const enterSession = async () => true;
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
