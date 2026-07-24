// @vitest-environment jsdom

import { act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { findTemplateIdUnderPointMock, getContentEventTargetElementMock } = vi.hoisted(() => ({
  findTemplateIdUnderPointMock: vi.fn(),
  getContentEventTargetElementMock: vi.fn(),
}));

vi.mock('../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/dom-host')>()),
  getContentEventTargetElement: getContentEventTargetElementMock,
}));

vi.mock('./targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./targets')>()),
  findTemplateIdUnderPoint: findTemplateIdUnderPointMock,
}));

import { useTemplateDragState } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useTemplateDragState> | null = null;
const pillRefs: React.RefObject<Map<string, HTMLDivElement>> = { current: new Map() };

function DragStateHarness(props: { onDrop: (sourceId: string, targetId: string) => void }) {
  latestState = useTemplateDragState(pillRefs, props.onDrop);
  return null;
}

async function renderHarness(onDrop: (sourceId: string, targetId: string) => void) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<DragStateHarness onDrop={onDrop} />);
  });
}

function createPointerEvent(overrides: Partial<React.MouseEvent> = {}) {
  return {
    button: 0,
    clientX: 10,
    clientY: 20,
    nativeEvent: new MouseEvent('mousedown'),
    ...overrides,
  } as React.MouseEvent;
}

function beginDrag(id = 'template-1', event = createPointerEvent()) {
  act(() => {
    latestState?.handlePointerDown(event, id);
  });
}

function dispatchMouse(type: 'mousemove' | 'mouseup', clientX: number, clientY: number) {
  act(() => {
    document.dispatchEvent(new MouseEvent(type, { clientX, clientY }));
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  latestState = null;
  pillRefs.current.clear();
  findTemplateIdUnderPointMock.mockReset();
  getContentEventTargetElementMock.mockReset();
  getContentEventTargetElementMock.mockReturnValue(document.createElement('div'));
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('useTemplateDragState', () => {
  it('ignores non-left clicks and menu button targets', async () => {
    await renderHarness(vi.fn());
    const menuButton = document.createElement('button');
    menuButton.dataset['menuBtn'] = 'true';

    beginDrag('template-1', createPointerEvent({ button: 1 }));
    getContentEventTargetElementMock.mockReturnValue(menuButton);
    beginDrag();

    expect(latestState?.dragState.current).toBeNull();
  });

  it('keeps movement at the threshold inactive and clears the pending pointer on mouseup', async () => {
    const onDrop = vi.fn();
    await renderHarness(onDrop);

    beginDrag();
    dispatchMouse('mousemove', 14, 24);

    expect(latestState?.draggedId).toBeNull();
    expect(latestState?.dragOverId).toBeNull();
    expect(latestState?.dragState.current?.moved).toBe(false);
    expect(findTemplateIdUnderPointMock).not.toHaveBeenCalled();

    dispatchMouse('mouseup', 14, 24);

    expect(latestState?.dragState.current).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('projects hover, commits a valid drop, and then clears transient drag state', async () => {
    let dragRefAtDrop: unknown = 'unset';
    const onDrop = vi.fn(() => {
      dragRefAtDrop = latestState?.dragState.current;
    });
    findTemplateIdUnderPointMock.mockReturnValue('template-2');
    await renderHarness(onDrop);

    beginDrag();
    dispatchMouse('mousemove', 30, 40);

    expect(latestState?.draggedId).toBe('template-1');
    expect(latestState?.dragOverId).toBe('template-2');
    expect(latestState?.dragState.current?.moved).toBe(true);

    dispatchMouse('mouseup', 35, 45);

    expect(onDrop).toHaveBeenCalledWith('template-1', 'template-2');
    expect(dragRefAtDrop).toBeNull();
    expect(latestState?.draggedId).toBeNull();
    expect(latestState?.dragOverId).toBeNull();
    expect(latestState?.dragState.current).toBeNull();
    expect(findTemplateIdUnderPointMock).toHaveBeenNthCalledWith(1, pillRefs.current, 30, 40);
    expect(findTemplateIdUnderPointMock).toHaveBeenNthCalledWith(2, pillRefs.current, 35, 45);
  });

  it('cleans up without committing when the drop target is missing or unchanged', async () => {
    const onDrop = vi.fn();
    await renderHarness(onDrop);

    findTemplateIdUnderPointMock.mockReturnValueOnce('template-2').mockReturnValueOnce(null);
    beginDrag();
    dispatchMouse('mousemove', 30, 40);
    dispatchMouse('mouseup', 35, 45);

    findTemplateIdUnderPointMock
      .mockReturnValueOnce('template-1')
      .mockReturnValueOnce('template-1');
    beginDrag();
    dispatchMouse('mousemove', 30, 40);
    dispatchMouse('mouseup', 35, 45);

    expect(onDrop).not.toHaveBeenCalled();
    expect(latestState?.draggedId).toBeNull();
    expect(latestState?.dragOverId).toBeNull();
    expect(latestState?.dragState.current).toBeNull();
  });

  it('removes document lifecycle listeners on unmount', async () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    await renderHarness(vi.fn());

    const moveListener = addEventListener.mock.calls.find(([type]) => type === 'mousemove')?.[1];
    const upListener = addEventListener.mock.calls.find(([type]) => type === 'mouseup')?.[1];

    act(() => {
      root?.unmount();
    });
    root = null;

    expect(removeEventListener).toHaveBeenCalledWith('mousemove', moveListener);
    expect(removeEventListener).toHaveBeenCalledWith('mouseup', upListener);
    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });
});
