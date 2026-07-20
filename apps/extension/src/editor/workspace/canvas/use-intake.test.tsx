// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fireAction: vi.fn((_: string, run: () => void) => run()),
  insertFile: vi.fn(),
  openFile: vi.fn(),
}));

vi.mock('../../runtime/async-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/async-actions')>()),
  fireAndReportEditorAction: mocks.fireAction,
}));

vi.mock('../../document/file-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/file-actions')>()),
  insertEditorImageFromFile: mocks.insertFile,
  openEditorImageFromFile: mocks.openFile,
}));

import { useCanvasImageIntake } from './use-intake';
import { createImageFile, createReactFileDragEvent, createTextFile } from './test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let hookValue: ReturnType<typeof useCanvasImageIntake> | null = null;

function renderHook(hasImage = false) {
  const controller = { openImage: vi.fn() };
  const setImageData = vi.fn();
  const openImageInputRef = { current: document.createElement('input') };

  function Harness() {
    hookValue = useCanvasImageIntake({
      controller: controller as never,
      hasImage,
      openImageInputRef,
      setImageData,
    });
    return null;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));

  return { controller, setImageData };
}

function createPasteEvent(file: File) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: [file],
      items: [],
    },
  });
  return event;
}

function registerImageDropOpenTest() {
  it('opens dropped files through the shared editor file action while empty', () => {
    const { controller, setImageData } = renderHook();
    const file = createImageFile('drop.png');
    const event = createReactFileDragEvent({ files: [file] });

    act(() => hookValue?.onDrop(event as never));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.fireAction).toHaveBeenCalledWith('canvas-open-image-drop', expect.any(Function));
    expect(mocks.openFile).toHaveBeenCalledWith(controller, file, setImageData);
  });
}

function registerPasteInsertTest() {
  it('inserts pasted images through the shared editor file action when a document is open', () => {
    const { controller } = renderHook(true);
    const file = createImageFile('paste.png');
    const event = createPasteEvent(file);

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.fireAction).toHaveBeenCalledWith(
      'canvas-insert-image-paste',
      expect.any(Function)
    );
    expect(mocks.insertFile).toHaveBeenCalledWith(controller, file);
  });
}

function registerEmptyPasteOpenTest() {
  it('listens for image paste while the editor is empty', () => {
    const { controller, setImageData } = renderHook();
    const file = createImageFile('paste.png');

    window.dispatchEvent(createPasteEvent(file));

    expect(mocks.fireAction).toHaveBeenCalledWith('canvas-open-image-paste', expect.any(Function));
    expect(mocks.openFile).toHaveBeenCalledWith(controller, file, setImageData);
  });
}

function registerUnsupportedDropTest() {
  it('claims unsupported file drops without running file actions', () => {
    renderHook(true);
    const event = createReactFileDragEvent({ files: [createTextFile()] });

    act(() => hookValue?.onDrop(event as never));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.openFile).not.toHaveBeenCalled();
    expect(mocks.insertFile).not.toHaveBeenCalled();
  });
}

function registerPendingFileDragTest() {
  it('tracks empty-state drag activity for browser file drags before files are readable', () => {
    renderHook(false);
    const pendingEvent = createReactFileDragEvent({ pending: true });

    act(() => hookValue?.onDragOver(pendingEvent as never));

    expect(pendingEvent.preventDefault).toHaveBeenCalledOnce();
    expect(hookValue?.dragActive).toBe(true);

    act(() => hookValue?.onDragLeave(pendingEvent as never));

    expect(hookValue?.dragActive).toBe(false);
  });
}

function registerChildDragLeaveTest() {
  it('keeps drag activity while the pending file drag moves inside the drop zone', () => {
    const currentTarget = document.createElement('div');
    const child = document.createElement('span');
    currentTarget.append(child);
    renderHook(false);

    act(() =>
      hookValue?.onDragOver(createReactFileDragEvent({ currentTarget, pending: true }) as never)
    );
    act(() =>
      hookValue?.onDragLeave(
        createReactFileDragEvent({ currentTarget, pending: true, relatedTarget: child }) as never
      )
    );

    expect(hookValue?.dragActive).toBe(true);
  });
}

function registerNoFileDragTest() {
  it('ignores drag activity without file ownership', () => {
    renderHook(false);
    const event = createReactFileDragEvent();

    act(() => hookValue?.onDragOver(event as never));

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(hookValue?.dragActive).toBe(false);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  hookValue = null;
  vi.clearAllMocks();
});

describe('useCanvasImageIntake', () => {
  registerImageDropOpenTest();
  registerPasteInsertTest();
  registerEmptyPasteOpenTest();
  registerUnsupportedDropTest();
  registerPendingFileDragTest();
  registerChildDragLeaveTest();
  registerNoFileDragTest();
});
