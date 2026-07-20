// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fireActionMock: vi.fn((_label, callback: () => unknown) => callback()),
  useEditorControllerMock: vi.fn(() => ({
    clearSelection: vi.fn(),
    redo: vi.fn(),
    resetToOriginal: vi.fn(),
    undo: vi.fn(),
  })),
}));

vi.mock('../../application/controller-context', () => ({
  EditorControllerProvider: ({ children }: { children: ReactNode }) => children,
  useEditorController: mocks.useEditorControllerMock,
  useOptionalEditorController: mocks.useEditorControllerMock,
}));

vi.mock('../../runtime/async-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/async-actions')>()),
  fireAndReportEditorAction: mocks.fireActionMock,
}));

vi.mock('lucide-react', () => ({
  Redo2: () => <span data-testid="redo-icon" />,
  RotateCcw: () => <span data-testid="reset-icon" />,
  Undo2: () => <span data-testid="undo-icon" />,
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function mountToolbar(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(node);
  });
}

function clickToolbarUndoButtons() {
  act(() => {
    document.querySelectorAll<HTMLButtonElement>('button')[0]?.click();
    document.querySelectorAll<HTMLButtonElement>('button')[1]?.click();
    document.querySelectorAll<HTMLButtonElement>('button')[2]?.click();
  });
}

it('renders compact shared toolbar chrome and wires undo actions through the controller seam', async () => {
  const { EditorToolbarDivider, EditorToolbarShell, EditorToolbarUndoSection } =
    await import('./shared');
  const controller = {
    clearSelection: vi.fn(),
    redo: vi.fn(),
    resetToOriginal: vi.fn(),
    undo: vi.fn(),
  };
  mocks.useEditorControllerMock.mockReturnValue(controller);

  mountToolbar(
    <>
      <EditorToolbarShell>
        <EditorToolbarDivider />
      </EditorToolbarShell>
      <EditorToolbarUndoSection
        hasImage
        history={{ canRedo: true, canUndo: true }}
        onBeforeSelectionAwareAction={vi.fn()}
      />
    </>
  );

  expect(container?.innerHTML).toContain('items-stretch');
  expect(container?.innerHTML).toContain('rounded-none');
  expect(container?.innerHTML).toContain('hidden h-8 lg:block');
  expect(container?.innerHTML).toContain('gap-1.5');

  clickToolbarUndoButtons();

  expect(mocks.fireActionMock).toHaveBeenCalledWith('toolbar-undo', expect.any(Function));
  expect(mocks.fireActionMock).toHaveBeenCalledWith('toolbar-redo', expect.any(Function));
  expect(mocks.fireActionMock).toHaveBeenCalledWith(
    'toolbar-reset-to-original',
    expect.any(Function)
  );
  expect(controller.clearSelection).toHaveBeenCalledTimes(3);
  expect(controller.undo).toHaveBeenCalledOnce();
  expect(controller.redo).toHaveBeenCalledOnce();
  expect(controller.resetToOriginal).toHaveBeenCalledOnce();
});

it('surfaces disabled undo and redo titles when history is unavailable', async () => {
  const { EditorToolbarUndoSection } = await import('./shared');

  mountToolbar(
    <EditorToolbarUndoSection
      hasImage={false}
      history={{ canRedo: false, canUndo: false }}
      onBeforeSelectionAwareAction={vi.fn()}
    />
  );

  const disabledButtons = container?.querySelectorAll<HTMLButtonElement>('button[disabled]') ?? [];
  expect(disabledButtons).toHaveLength(3);
  expect(disabledButtons[0]?.title).toContain('·');
  expect(disabledButtons[1]?.title).toContain('·');
});
