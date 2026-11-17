// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { VideoEditorFloatingDocumentBar } from './document-bar';
import { useVideoEditorStore } from '../../state/store';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';

const hookMocks = vi.hoisted(() => ({ header: vi.fn(), history: vi.fn() }));

beforeEach(() => {
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
  useVideoEditorStore.getState().setProject(createEmptyVideoProject('Original'));
});
afterEach(() => useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true));

vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorHeaderController: () => hookMocks.header(),
  useVideoEditorHistoryController: () => hookMocks.history(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createHeaderProps() {
  return {
    grid: { magnetEnabled: true, onToggleMagnet: vi.fn() },
    inspectorMode: 'selection' as const,
    libraryPanelOpen: false,
    leftSidebarCollapsed: false,
    onCloseLibraryPanel: vi.fn(),
    onOpenAudioRecordingDialog: vi.fn(),
    onOpenExportDialog: vi.fn(),
    onOpenLibraryPanel: vi.fn(),
    onRenameProject: vi.fn(),
    onSelectScene: vi.fn(),
    onToggleLibraryPanel: vi.fn(),
    onToggleSidebar: vi.fn(),
    projectExportsCount: 2,
    projectName: 'Product Demo Recording',
    saveStateMeta: { className: 'is-saved', label: 'Saved', state: 'saved' as const },
  };
}

it('renders editable project identity without duplicated workspace commands', () => {
  hookMocks.header.mockReturnValue(createHeaderProps());
  hookMocks.history.mockReturnValue({
    canUndo: false,
    canRedo: false,
    error: null,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  });
  const markup = renderToStaticMarkup(<VideoEditorFloatingDocumentBar />);

  expect(markup).toContain('data-ui="video-editor.floating.document-bar"');
  expect(markup).toContain('Product Demo Recording');
  expect(markup).not.toContain('Saved');
  expect(markup).not.toContain('videoEditor.app.libraryButton');
  expect(markup).not.toContain('videoEditor.app.exportButton');
  expect(markup).not.toContain('lucide-pencil');
  expect(markup).not.toContain('video-editor.floating.document-bar.undo');
  expect(markup).not.toContain('video-editor.floating.document-bar.redo');
  expect(markup).not.toContain('data-ui="video-editor.floating.document-bar.menu"');
  expect(markup).not.toContain('title="videoEditor.app.title"');
  expect(markup).not.toContain('Sniptale');
});

it('enables available history commands and surfaces history failures', () => {
  hookMocks.header.mockReturnValue(createHeaderProps());
  hookMocks.history.mockReturnValue({
    canUndo: true,
    canRedo: false,
    error: 'snapshotFailed',
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  });
  const markup = renderToStaticMarkup(<VideoEditorFloatingDocumentBar />);

  expect(markup).toContain('role="alert"');
  expect(markup).toContain('videoEditor.app.historyError');
});

it('keeps autosave recovery in the timeline toolbar', () => {
  hookMocks.header.mockReturnValue({
    ...createHeaderProps(),
    saveStateMeta: { className: 'is-error', label: 'Error', state: 'error' },
  });
  hookMocks.history.mockReturnValue({
    canUndo: false,
    canRedo: false,
    error: null,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  });
  const markup = renderToStaticMarkup(<VideoEditorFloatingDocumentBar />);

  expect(markup).not.toContain('common.actions.retry');
});

it.each(['dirty', 'saving', 'saved', 'idle'])(
  'keeps routine %s persistence state out of the toolbar',
  (state) => {
    hookMocks.header.mockReturnValue({
      ...createHeaderProps(),
      saveStateMeta: { state, label: 'Routine save state', className: '' },
    });
    hookMocks.history.mockReturnValue({
      canUndo: false,
      canRedo: false,
      error: null,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
    });
    const markup = renderToStaticMarkup(<VideoEditorFloatingDocumentBar />);
    expect(markup).not.toContain('Routine save state');
    expect(markup).not.toContain('role="alert"');
  }
);

it('replaces project identity with source navigation while recovery stays in the timeline toolbar', () => {
  hookMocks.header.mockReturnValue({
    ...createHeaderProps(),
    saveStateMeta: { state: 'error', label: 'Failed', className: '' },
  });
  hookMocks.history.mockReturnValue({ error: null });
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingDocumentBar>
      <button>Source / Montage</button>
    </VideoEditorFloatingDocumentBar>
  );
  expect(markup).toContain('Source / Montage');
  expect(markup).not.toContain('Product Demo Recording');
  expect(markup).not.toContain('<input');
  expect(markup).not.toContain('common.actions.retry');
});

it('clears live project identity through its normal rename callback and keeps input focus', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const rename = vi.fn();
  function LiveDocument() {
    const [projectName, setName] = useState('Demo');
    hookMocks.header.mockReturnValue({
      ...createHeaderProps(),
      projectName,
      onRenameProject: (name: string) => {
        rename(name);
        setName(name);
      },
    });
    hookMocks.history.mockReturnValue({ error: null });
    return <VideoEditorFloatingDocumentBar />;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() => root.render(<LiveDocument />));
    const input = host.querySelector<HTMLInputElement>('input')!;
    act(() => host.querySelector<HTMLButtonElement>('.sniptale-field-clear')!.click());
    expect(rename).toHaveBeenCalledExactlyOnceWith('');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(host.querySelector('.sniptale-field-clear')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

function mountLiveHistoryTitle() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  hookMocks.header.mockImplementation(() => {
    const projectName = useVideoEditorStore((state) => state.project?.name ?? '');
    return {
      ...createHeaderProps(),
      projectName,
      onRenameProject: useVideoEditorStore.getState().renameProject,
    };
  });
  hookMocks.history.mockReturnValue({ error: null });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<VideoEditorFloatingDocumentBar />));
  const input = host.querySelector('input');
  if (!input) throw new Error('Expected project title field');
  return {
    input,
    dispose() {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}

function typeTitle(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Expected native value setter');
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('undoes one title typing session as one action and keeps a second session separate', () => {
  const view = mountLiveHistoryTitle();
  try {
    act(() => view.input.focus());
    for (const value of ['Original A', 'Original AB', 'Original ABC']) typeTitle(view.input, value);
    act(() => view.input.blur());
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
    act(() => useVideoEditorStore.getState().undoProject());
    expect(view.input.value).toBe('Original');
    act(() => useVideoEditorStore.getState().redoProject());
    act(() => view.input.focus());
    typeTitle(view.input, 'Next title');
    act(() => view.input.blur());
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(2);
    act(() => useVideoEditorStore.getState().undoProject());
    expect(view.input.value).toBe('Original ABC');
  } finally {
    view.dispose();
  }
});

it('preserves Redo after a title no-op or Escape and does not cancel IME composition', () => {
  const state = useVideoEditorStore.getState();
  state.renameProject('Redo title');
  state.undoProject();
  const view = mountLiveHistoryTitle();
  try {
    act(() => view.input.focus());
    typeTitle(view.input, 'Temporary');
    typeTitle(view.input, 'Original');
    act(() => view.input.blur());
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
    expect(useVideoEditorStore.getState().projectHistory.future).toHaveLength(1);
    act(() => view.input.focus());
    typeTitle(view.input, 'Черновик');
    act(() =>
      view.input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })
      )
    );
    expect(view.input.value).toBe('Черновик');
    act(() =>
      view.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(view.input.value).toBe('Original');
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
    expect(useVideoEditorStore.getState().projectHistory.future).toHaveLength(1);
  } finally {
    view.dispose();
  }
});

it('does not merge a title change into another active gesture', () => {
  const foreign = useVideoEditorStore.getState().beginProjectHistoryTransaction();
  if (!foreign) throw new Error('Expected gesture lease');
  const view = mountLiveHistoryTitle();
  try {
    act(() => view.input.focus());
    typeTitle(view.input, 'Foreign edit');
    expect(view.input.value).toBe('Original');
    expect(useVideoEditorStore.getState().isProjectHistoryTransactionCurrent(foreign)).toBe(true);
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  } finally {
    view.dispose();
    useVideoEditorStore.getState().endProjectHistoryTransaction(foreign, 'cancel');
  }
});
