// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImageEditorActions } from './image-editor-actions';

const mocks = vi.hoisted(() => ({ list: vi.fn(), createTab: vi.fn(), editorUrl: vi.fn() }));
vi.mock('../../../composition/persistence/image-workspaces/read', () => ({
  listImageProjectsForEditing: mocks.list,
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs: { create: mocks.createTab } }));
vi.mock('@sniptale/platform/security/secure-random-id', () => ({
  createSecureRandomUuid: () => 'allocated-project',
}));
vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: mocks.editorUrl,
}));
vi.mock('../../../platform/i18n', async (original) => ({
  ...(await original()),
  translate: (key: string) => key,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const onOpenLegacy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () =>
    root.render(<ImageEditorActions mediaId="original" onOpenLegacy={onOpenLegacy} />)
  );
}

async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find((node) =>
    node.textContent?.includes(label)
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

it('opens a new project on an unused original', async () => {
  mocks.list.mockResolvedValue({ canCreateIndependentProject: true, projects: [] });
  await mount();
  await click('gallery.preview.openInEditor');
  expect(mocks.editorUrl).toHaveBeenCalledExactlyOnceWith({
    assetId: 'allocated-project',
    originalId: 'original',
  });
});

it('offers existing projects and opens the selected project by its own ID', async () => {
  mocks.list.mockResolvedValue({
    canCreateIndependentProject: true,
    projects: [{ id: 'stored-project', name: 'Saved composition', updatedAt: 100 }],
  });
  await mount();
  await click('gallery.preview.openInEditor');
  expect(mocks.createTab).not.toHaveBeenCalled();
  expect(host.textContent).toContain('gallery.preview.newImageProject');
  await click('Saved composition');
  expect(mocks.editorUrl).toHaveBeenCalledExactlyOnceWith({ assetId: 'stored-project' });
});

it('does not open a tab when the original preview closes during lookup', async () => {
  const result = Promise.withResolvers<{ canCreateIndependentProject: boolean; projects: [] }>();
  mocks.list.mockReturnValue(result.promise);
  await mount();
  await click('gallery.preview.openInEditor');
  await act(async () => root.render(null));
  await act(async () => result.resolve({ canCreateIndependentProject: true, projects: [] }));
  expect(mocks.createTab).not.toHaveBeenCalled();
});
