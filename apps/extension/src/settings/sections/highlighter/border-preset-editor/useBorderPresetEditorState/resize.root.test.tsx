// @vitest-environment jsdom

import { act, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBorderPresetEditorState, type BorderPresetEditorProps } from '.';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

type EditorState = ReturnType<typeof useBorderPresetEditorState>;

let container: HTMLDivElement | null = null;
let latestState: EditorState | null = null;
let root: Root | null = null;

function BorderPresetEditorHarness(props: BorderPresetEditorProps) {
  const state = useBorderPresetEditorState(props);

  useEffect(() => {
    latestState = state;
  });

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderHarness(props: Partial<BorderPresetEditorProps> = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <BorderPresetEditorHarness isOpen={true} onClose={vi.fn()} onSave={vi.fn()} {...props} />
    );
  });
  await flushEffects();
}

function getState() {
  if (!latestState) {
    throw new Error('Hook state is not ready');
  }

  return latestState;
}

function startResize() {
  act(() => {
    getState().handleResizeStart({
      clientY: 100,
      preventDefault: vi.fn(),
    } as unknown as ReactMouseEvent);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('border preset editor resize', () => {
  it('resizes the textarea and removes document listeners on mouseup', async () => {
    await renderHarness();

    startResize();
    expect(getState().isResizing).toBe(true);

    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 180 }));
    });
    await flushEffects();

    expect(getState().textareaHeight).toBe(152);

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'));
    });
    await flushEffects();

    expect(getState().isResizing).toBe(false);
  });

  it('removes document listeners when the editor closes before mouseup', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    await renderHarness();

    startResize();

    const mouseMoveListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'mousemove'
    )?.[1];
    const mouseUpListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'mouseup'
    )?.[1];

    expect(mouseMoveListener).toBeTypeOf('function');
    expect(mouseUpListener).toBeTypeOf('function');

    await renderHarness({ isOpen: false });

    expect(getState().isResizing).toBe(false);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', mouseMoveListener);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', mouseUpListener);
  });
});
