// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  thumbnail: vi.fn(),
  cover: vi.fn(),
  create: vi.fn(),
  open: vi.fn(),
  gallery: vi.fn(),
}));
vi.mock('../../../composition/persistence/projects', () => ({
  listVideoProjects: mocks.list,
  getVideoProject: vi.fn(),
  getProjectAsset: vi.fn(),
}));
vi.mock('../../../composition/persistence/media-library', () => ({
  getMediaAssetBlob: vi.fn(),
}));
vi.mock('../../../platform/navigation/extension-pages', () => ({ openGalleryPage: mocks.gallery }));
vi.mock('../../runtime/controller/composition/hooks', () => ({
  useVideoEditorStartActions: () => ({ onCreate: mocks.create, onOpen: mocks.open }),
}));
vi.mock('../../runtime/commands/project-transition', () => ({
  useProjectTransitionPending: () => false,
}));
vi.mock('../../../platform/i18n', () => ({ translate: (key: string) => key }));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  getScenarioAssetBlob: vi.fn(),
}));
vi.mock('../../../composition/persistence/recordings', () => ({ getRecording: vi.fn() }));
vi.mock('../../../composition/persistence/scenario/projects', () => ({
  getScenarioAsset: vi.fn(),
  getScenarioProjectEntry: vi.fn(),
}));
vi.mock('../../../workflows/project-covers', () => ({
  createProjectCoverService: () => ({ getCover: mocks.cover }),
}));
import { VideoEditorStart } from './start';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
async function render() {
  await act(async () => root.render(<VideoEditorStart />));
}
function buttons() {
  return [...container.querySelectorAll<HTMLButtonElement>('button')];
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.list.mockReset().mockResolvedValue([]);
  mocks.thumbnail.mockReset().mockResolvedValue(undefined);
  mocks.cover.mockReset().mockResolvedValue(undefined);
  mocks.create.mockReset().mockResolvedValue(undefined);
  mocks.open.mockReset().mockResolvedValue(undefined);
  mocks.gallery.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('lists active projects, opens a recent card, and creates through the existing command', async () => {
  mocks.list.mockResolvedValue([
    { id: 'trashed', name: 'Trash', updatedAt: 9, lifecycle: { trashedAt: 9 } },
    { id: 'unsupported', name: 'Old', updatedAt: 8, unavailableReason: 'invalid' },
    { id: 'ready', name: 'Ready', updatedAt: 7, width: 1280, height: 720, thumbnailId: 'thumb' },
  ]);
  await render();
  expect(container.textContent).toContain('Ready');
  expect(container.textContent).not.toContain('Trash');
  await act(async () => buttons()[2]?.click());
  expect(mocks.open).toHaveBeenCalledWith('ready');
  await act(async () => buttons()[0]?.click());
  expect(mocks.create).toHaveBeenCalledOnce();
});

it('keeps actions available when the list or create command fails', async () => {
  mocks.list.mockRejectedValue(new Error('storage'));
  mocks.create.mockRejectedValueOnce(new Error('quota'));
  await render();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => buttons()[0]?.click());
  expect(container.textContent).toContain('shared.editorStart.openFailed');
  await act(async () =>
    buttons()
      .find((button) => button.textContent?.includes('shared.editorStart.open'))
      ?.click()
  );
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
    { kind: 'video-project', id: 'current', workspaceRevision: 4 },
    expect.any(AbortSignal)
  );
});
