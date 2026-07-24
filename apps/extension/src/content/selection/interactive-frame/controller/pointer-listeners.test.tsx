// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { InteractiveFrameListenerConfig } from './types';

const pointerActions = vi.hoisted(() => ({
  abort: vi.fn(() => false),
  cancel: vi.fn(() => false),
  move: vi.fn(),
  up: vi.fn(),
}));

vi.mock('../editing/pointer-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editing/pointer-actions')>()),
  createInteractiveFramePointerAbortHandler: () => pointerActions.abort,
  createInteractiveFramePointerCancelHandler: () => pointerActions.cancel,
  createInteractiveFramePointerMoveHandler: () => pointerActions.move,
  createInteractiveFramePointerUpHandler: () => pointerActions.up,
}));

import { useInteractiveFramePointerListeners } from './pointer-listeners';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

it('routes lost pointer capture through the rollback handler', () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  function Harness() {
    useInteractiveFramePointerListeners({} as InteractiveFrameListenerConfig);
    return null;
  }

  act(() => root?.render(<Harness />));
  act(() => document.dispatchEvent(new Event('lostpointercapture')));

  expect(pointerActions.cancel).toHaveBeenCalledOnce();
});

it('aborts the complete pointer session when listeners unmount', () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  function Harness() {
    useInteractiveFramePointerListeners({} as InteractiveFrameListenerConfig);
    return null;
  }

  act(() => root?.render(<Harness />));
  act(() => root?.unmount());
  root = null;

  expect(pointerActions.abort).toHaveBeenCalledOnce();
});
