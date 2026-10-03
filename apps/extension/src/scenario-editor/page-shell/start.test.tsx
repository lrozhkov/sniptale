// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  thumbnail: vi.fn(),
  cover: vi.fn(),
  gallery: vi.fn(),
}));
vi.mock('../../composition/persistence/scenario/store/public', () => ({
  listScenarioProjectSummaries: mocks.list,
  getScenarioAssetBlob: vi.fn(),
}));
vi.mock('../../composition/persistence/media-library', () => ({
  getMediaAssetBlob: vi.fn(),
}));
vi.mock('../../platform/navigation/extension-pages', () => ({ openGalleryPage: mocks.gallery }));
vi.mock('../../composition/persistence/projects', () => ({
  getVideoProject: vi.fn(),
  getProjectAsset: vi.fn(),
}));
vi.mock('../../composition/persistence/recordings', () => ({ getRecording: vi.fn() }));
vi.mock('../../composition/persistence/scenario/projects', () => ({
  getScenarioAsset: vi.fn(),
  getScenarioProjectEntry: vi.fn(),
}));
vi.mock('../../workflows/project-covers', () => ({
  createProjectCoverService: () => ({ getCover: mocks.cover }),
}));
import { ScenarioEditorStart } from './start';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const create = vi.fn();
const openExisting = vi.fn();
const reload = vi.fn();
function state(status: string = 'empty') {
  return { status, create, openExisting, reload } as unknown as React.ComponentProps<
    typeof ScenarioEditorStart
  >['state'];
}
async function render(status = 'empty') {
  await act(async () =>
    root.render(<ScenarioEditorStart state={state(status)} t={(key) => key} />)
  );
}
function actions() {
  return [...container.querySelectorAll<HTMLButtonElement>('[data-ui="editor.start"] button')];
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.list.mockReset().mockResolvedValue([]);
  mocks.thumbnail.mockReset().mockResolvedValue(undefined);
  mocks.cover.mockReset().mockResolvedValue(undefined);
  mocks.gallery.mockReset();
  create.mockReset().mockResolvedValue(true);
  openExisting.mockReset().mockResolvedValue(undefined);
  reload.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('lists compatible scenario projects and reopens one through state authority', async () => {
  mocks.list.mockResolvedValue([
    { id: 'trashed', name: 'Trash', updatedAt: 9, lifecycle: { trashedAt: 9 } },
    { id: 'ready', name: 'Ready', updatedAt: 8, availability: 'available' },
    { id: 'old', name: 'Old', updatedAt: 7, availability: 'unsupported' },
  ]);
  await render();
  expect(container.textContent).toContain('Ready');
  expect(container.textContent).not.toContain('Trash');
  expect(actions()[3]?.disabled).toBe(true);
  await act(async () => actions()[2]?.click());
  expect(openExisting).toHaveBeenCalledWith('ready');
  await act(async () => actions()[0]?.click());
  expect(create).toHaveBeenCalledWith('scenario.common.defaultProjectName');
});

it('shows a retry for a missing direct link and keeps project creation available', async () => {
  await render('missing');
  expect(container.textContent).toContain('scenario.editor.guideMissing');
  await act(async () => actions()[2]?.click());
  expect(reload).toHaveBeenCalledOnce();
  expect(actions()[0]?.disabled).toBe(false);
});

it('opens Gallery if the project list fails and reports a failed create', async () => {
  mocks.list.mockRejectedValueOnce(new Error('storage'));
  create.mockResolvedValueOnce(false);
  await render();
  await act(async () => actions()[0]?.click());
  expect(container.textContent).toContain('shared.editorStart.createFailed');
  await act(async () => actions()[1]?.click());
  expect(mocks.gallery).toHaveBeenCalledOnce();
});

it('captures the saved project revision for its visible-card cover request', async () => {
  mocks.list.mockResolvedValue([
    {
      id: 'current',
      name: 'Current',
      updatedAt: 10,
      workspaceRevision: 4,
      availability: 'available',
      width: 640,
      height: 360,
    },
  ]);
  await render();
  expect(mocks.cover).toHaveBeenCalledWith(
    { kind: 'scenario', id: 'current', workspaceRevision: 4 },
    expect.any(AbortSignal)
  );
});
