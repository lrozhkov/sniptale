// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/public';
import { useGuidePageState } from './use-state';
const io = vi.hoisted(() => ({
  load: vi.fn(),
  apply: vi.fn(),
  saveTemplate: vi.fn(),
  import: vi.fn(),
  save: vi.fn(),
}));
vi.mock('./resource-session', () => ({ useGuideResourceSession: () => enterSession }));
const enterSession = async () => true;
vi.mock('../../../composition/persistence/scenario/history', () => ({
  getScenarioSavedVersions: io.load,
}));
vi.mock('../../../composition/persistence/scenario/store/project-records/assets', () => ({
  getScenarioAssetBlob: async () => undefined,
}));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  applyScenarioStepTemplate: io.apply,
  saveScenarioStepTemplate: io.saveTemplate,
  importScenarioImages: io.import,
  saveScenarioProjectRecord: io.save,
}));
vi.mock('../../platform/browser-driver', () => ({ replaceScenarioEditorSelectionInUrl: vi.fn() }));
let state: ReturnType<typeof useGuidePageState>;
let root: Root;
let host: HTMLDivElement;
function Probe() {
  state = useGuidePageState();
  return null;
}
function fixture() {
  const project = createGuideProject('Guide', 'guide', 1);
  project.items = [createGuideStep('Original', 'step')];
  return project;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/?projectId=guide');
  const project = fixture();
  io.load.mockResolvedValue({ versions: [{ project, revision: 1, savedAt: 1 }] });
  io.saveTemplate.mockResolvedValue({ ...project, id: 'template', purpose: 'step-template' });
  io.apply.mockImplementation(async ({ project }) => ({
    ...project,
    updatedAt: 2,
    items: [{ ...project.items[0], title: 'From template' }],
  }));
  io.import.mockImplementation(async ({ project }) => ({ ...project, updatedAt: 2 }));
  io.save.mockImplementation(async (project) => ({ ...project, updatedAt: 3 }));
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
  await act(async () => root.render(createElement(Probe)));
}
it('adopts template publication once and restores content through the existing undo path', async () => {
  await mount();
  await act(async () => {
    expect(
      await state.commitChange({
        kind: 'template',
        input: { templateId: 'template', stepId: 'step', mode: 'replace' },
      })
    ).toBe(true);
  });
  expect(state.project?.items[0]?.title).toBe('From template');
  expect(state.canUndo).toBe(true);
  expect(io.apply).toHaveBeenCalledWith(expect.objectContaining({ baseUpdatedAt: 1 }));
  act(() => state.undo());
  expect(state.project?.items[0]?.title).toBe('Original');
});
it('saves a template without replacing the current project or its undo history', async () => {
  await mount();
  await act(async () => {
    expect(await state.saveTemplate('step', 'Reusable')).toBe(true);
  });
  expect(state.project?.id).toBe('guide');
  expect(state.project?.items[0]?.title).toBe('Original');
  expect(state.canUndo).toBe(false);
});
it('keeps current content when a stale template application is rejected', async () => {
  const error = new Error('Stale');
  error.name = 'StaleScenarioAggregateRevisionError';
  io.apply.mockRejectedValue(error);
  await mount();
  await act(async () => {
    expect(
      await state.commitChange({
        kind: 'template',
        input: { templateId: 'template', stepId: 'step', mode: 'replace' },
      })
    ).toBe(false);
  });
  expect(state.status).toBe('conflict');
  expect(state.project?.items[0]?.title).toBe('Original');
});
it('routes canvas and library step imports into the sole template step', async () => {
  const project = { ...fixture(), purpose: 'step-template' as const };
  io.load.mockResolvedValue({ versions: [{ project, revision: 1, savedAt: 1 }] });
  await mount();
  await act(async () => {
    await state.commitChange({
      kind: 'import',
      input: { sources: [], placement: { kind: 'steps' }, signal: new AbortController().signal },
    });
  });
  expect(io.import).toHaveBeenCalledWith(
    expect.objectContaining({ placement: { kind: 'blocks', stepId: 'step' } })
  );
});
