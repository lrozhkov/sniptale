// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVideoEditorWorkspaceState, type VideoEditorWorkspaceState } from './workspace-state';

function renderWorkspaceHarness(
  root: Root | null,
  onState: (state: VideoEditorWorkspaceState) => void
) {
  const Harness = () => {
    const nextWorkspaceState = useVideoEditorWorkspaceState();
    onState(nextWorkspaceState);
    return <div ref={nextWorkspaceState.preview.workspaceSplitRef} />;
  };

  act(() => {
    root?.render(<Harness />);
  });
}

function mockWorkspaceBounds(workspaceState: VideoEditorWorkspaceState) {
  const splitNode = workspaceState.preview.workspaceSplitRef.current!;
  vi.spyOn(splitNode, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  });
}

function dispatchResizeMove(clientY: number) {
  const moveEvent = new Event('pointermove');
  Object.defineProperty(moveEvent, 'clientY', { value: clientY });
  window.dispatchEvent(moveEvent);
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let workspaceState: VideoEditorWorkspaceState | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  workspaceState = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('resolves the confirm dialog promise through the exposed callbacks', async () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });

  let pendingConfirm: Promise<boolean>;
  await act(async () => {
    pendingConfirm = workspaceState!.confirm.request({
      title: 'Delete project',
      message: 'Are you sure?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    await Promise.resolve();
  });

  expect(workspaceState!.confirm.dialog?.title).toBe('Delete project');

  act(() => {
    workspaceState!.confirm.onConfirm();
  });

  await expect(pendingConfirm!).resolves.toBe(true);
  expect(workspaceState!.confirm.dialog).toBeNull();
});

it('updates the preview pane height while vertical resize listeners are active', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });

  mockWorkspaceBounds(workspaceState!);

  act(() => {
    workspaceState!.preview.handleStartVerticalResize({
      clientY: 100,
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent<HTMLDivElement>);
  });

  act(() => {
    dispatchResizeMove(180);
  });

  expect(workspaceState!.preview.paneHeight).toBe(380);

  act(() => {
    window.dispatchEvent(new Event('pointerup'));
  });

  act(() => {
    dispatchResizeMove(220);
  });

  expect(workspaceState!.preview.paneHeight).toBe(380);
});

it('cleans up resize listeners when the workspace unmounts mid-drag', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });

  mockWorkspaceBounds(workspaceState!);
  act(() => {
    workspaceState!.preview.handleStartVerticalResize({
      clientY: 100,
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent<HTMLDivElement>);
  });
  act(() => {
    root?.unmount();
  });
  act(() => {
    dispatchResizeMove(180);
  });

  expect(workspaceState!.preview.paneHeight).toBeNull();
});

it('stores and clears the local playback loop range without touching project state', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });

  act(() => {
    workspaceState!.setPlaybackRange({ start: 1.25, end: 3.5 });
  });

  expect(workspaceState!.playbackRange).toEqual({ start: 1.25, end: 3.5 });

  act(() => {
    workspaceState!.clearPlaybackRange();
  });

  expect(workspaceState!.playbackRange).toBeNull();
});
