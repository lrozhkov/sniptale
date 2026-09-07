// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { VideoEditorWorkspaceHeaderActions } from './top-panels';
import { VideoEditorLibraryNavigation, VideoEditorWorkspaceHeader } from './index';
const actions = vi.hoisted(() => ({
  onSelectScene: vi.fn(),
  projectName: 'Demo',
  saveStateMeta: { state: 'saved' },
}));
vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorHeaderController: () => actions,
  useVideoEditorHistoryController: () => ({ error: null }),
}));
it('offers Scene and only the hidden inspector opener, without legacy tool buttons', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const open = vi.fn();
  const change = vi.fn();
  try {
    act(() =>
      root.render(
        <>
          <VideoEditorWorkspaceHeaderActions inspectorOpen={false} onOpenInspector={open} />
          <VideoEditorLibraryNavigation active="materials" onChange={change} />
        </>
      )
    );
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-ui="video-editor.viewer.scene"]')!.click()
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[data-ui="video-editor.viewer.open-inspector"]')!
        .click()
    );
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-ui="video-editor.library-tab.effects"]')!.click()
    );
    expect(actions.onSelectScene).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledWith('effects');
    expect(host.querySelector('input[type=file]')).toBeNull();
    act(() =>
      root.render(<VideoEditorWorkspaceHeaderActions inspectorOpen onOpenInspector={open} />)
    );
    expect(host.querySelector('[data-ui="video-editor.viewer.open-inspector"]')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(1);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('opens each closed library mode directly and removes both openers when the panel opens', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const materials = vi.fn(),
    effects = vi.fn();
  try {
    act(() =>
      root.render(
        <VideoEditorWorkspaceHeader
          libraryOpen={false}
          onOpenLibraryPanel={materials}
          onOpenEffectsPanel={effects}
        />
      )
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[data-ui="video-editor.viewer.open-materials"]')!
        .click()
    );
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-ui="video-editor.viewer.open-effects"]')!.click()
    );
    expect(materials).toHaveBeenCalledOnce();
    expect(effects).toHaveBeenCalledOnce();
    act(() =>
      root.render(
        <VideoEditorWorkspaceHeader
          libraryOpen
          onOpenLibraryPanel={materials}
          onOpenEffectsPanel={effects}
        />
      )
    );
    expect(host.querySelector('[data-ui="video-editor.viewer.open-materials"]')).toBeNull();
    expect(host.querySelector('[data-ui="video-editor.viewer.open-effects"]')).toBeNull();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
