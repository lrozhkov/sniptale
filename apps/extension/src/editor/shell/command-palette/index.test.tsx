// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CommandPaletteAction, CommandPaletteProps } from '../../../ui/command-palette/types';

const mocks = vi.hoisted(() => ({
  commandPalette: vi.fn((props: CommandPaletteProps) => (
    <div data-error={props.actionError ?? ''} data-ui={props.dataUi} />
  )),
  controller: {
    copyRenderedImage: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    exportDocument: vi.fn(),
    redo: vi.fn(),
    renderToDataUrl: vi.fn(),
    resetZoom: vi.fn(),
    setActiveTool: vi.fn(),
    undo: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomToFit: vi.fn(),
  },
  reportFailure: vi.fn(() => 'Copy failed'),
  storeState: {
    activeTool: 'select',
    history: { canRedo: false, canUndo: true, index: 0, size: 1 },
    selection: {
      hasSelection: false,
      selectedObjectCount: 0,
      selectedObjectHeight: null,
      selectedObjectId: null,
      selectedObjectIds: [],
      selectedObjectType: null,
      selectedObjectWidth: null,
    },
    setActiveTool: vi.fn(),
    setImageData: vi.fn(),
    setInspector: vi.fn(),
  },
}));

vi.mock('../../../ui/command-palette', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/command-palette')>()),
  CommandPalette: mocks.commandPalette,
}));
vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => mocks.controller,
}));
vi.mock('../../runtime/async-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/async-actions')>()),
  reportEditorActionFailure: mocks.reportFailure,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: (selector: (state: typeof mocks.storeState) => unknown) =>
    selector(mocks.storeState),
}));

import { EditorCommandPalette } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPalette() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(<EditorCommandPalette hasImage isOpen onClose={() => undefined} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('surfaces command palette document action failures inline through the shared reporter', () => {
  renderPalette();

  const props = mocks.commandPalette.mock.calls.at(-1)?.[0] as CommandPaletteProps;
  const action = props.actions.find((candidate) => candidate.id === 'editor-copy-png');
  expect(action).toBeDefined();

  act(() => {
    props.onActionError?.(action as CommandPaletteAction, new Error('clipboard'));
  });

  expect(mocks.reportFailure).toHaveBeenCalledWith(
    'command-palette:editor-copy-png',
    expect.any(Error),
    { notify: false }
  );
  expect(
    container?.querySelector('[data-ui="editor.command-palette"]')?.getAttribute('data-error')
  ).toBe('Copy failed');

  const latestProps = mocks.commandPalette.mock.calls.at(-1)?.[0] as CommandPaletteProps;
  act(() => {
    latestProps.onActionStart?.(action as CommandPaletteAction);
  });

  expect(
    container?.querySelector('[data-ui="editor.command-palette"]')?.getAttribute('data-error')
  ).toBe('');
});
