// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/public';
import { useGuidePageState } from './use-state';
const io = vi.hoisted(() => ({
  load: vi.fn(),
  apply: vi.fn(),
  tourEdit: vi.fn(),
  saveTemplate: vi.fn(),
  import: vi.fn(),
  save: vi.fn(),
}));
vi.mock('../../../workflows/scenario-capture-edit/tour-edits', () => ({
  applyTourImageEdit: io.tourEdit,
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

const input = {
  target: {
    projectId: 'guide',
    slideId: 'slide',
    role: 'image' as const,
    assetId: 'asset',
    editDocumentId: null,
  },
  dataUrl: 'data:image/png;base64,YQ==',
  document: {} as import('../../../features/editor/document/public').EditorDocument,
};
it('keeps review separate from publication and Undo', async () => {
  io.tourEdit.mockResolvedValueOnce({ status: 'requires-target-review' });
  await mount();
  const original = state.project;
  await act(async () =>
    expect(await state.commitChange({ kind: 'tour-edit', input })).toBe('requires-target-review')
  );
  expect(state.project).toBe(original);
  expect(state.canUndo).toBe(false);
  expect(state.actionError).toBeNull();
  expect(state.mutationPending).toBe(false);
  io.tourEdit.mockImplementationOnce(async ({ project }) => ({
    status: 'applied',
    project: { ...project, name: 'Edited', updatedAt: 2 },
  }));
  await act(async () =>
    expect(
      await state.commitChange({ kind: 'tour-edit', input: { ...input, allowTargetReview: true } })
    ).toBe(true)
  );
  expect(state.project?.name).toBe('Edited');
  expect(state.canUndo).toBe(true);
  expect(io.tourEdit).toHaveBeenLastCalledWith(
    expect.objectContaining({ baseUpdatedAt: 1, allowTargetReview: true })
  );
  act(() => state.undo());
  expect(state.project?.name).toBe(original?.name);
});
it('preserves the project and surfaces revision conflicts from tour image publication', async () => {
  const error = new Error('stale');
  error.name = 'StaleScenarioAggregateRevisionError';
  io.tourEdit.mockRejectedValueOnce(error);
  await mount();
  const original = state.project;
  await act(async () => expect(await state.commitChange({ kind: 'tour-edit', input })).toBe(false));
  expect(state.project).toBe(original);
  expect(state.status).toBe('conflict');
  expect(state.canUndo).toBe(false);
});
