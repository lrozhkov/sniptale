// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { createFrameDataFixture } from '../../frame-runtime/test-support';
import { useInteractiveFramePointerSession } from './pointer-session';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let session: ReturnType<typeof useInteractiveFramePointerSession> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  session = null;
});

it('groups pointer activity, current values, and gesture origin by role', () => {
  const frame = createFrameDataFixture('frame-1');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  function Harness() {
    session = useInteractiveFramePointerSession(frame, 'border');
    return null;
  }

  act(() => root?.render(<Harness />));

  expect(session?.activity.pointerIdRef.current).toBeNull();
  expect(session?.activity.resizeRafIdRef.current).toBeNull();
  expect(session?.activity.latestResizeSampleRef.current).toBeNull();
  expect(session?.current.tempFrameRef.current).toBe(frame);
  expect(session?.origin.startFrameRef.current).toBe(frame);
});
