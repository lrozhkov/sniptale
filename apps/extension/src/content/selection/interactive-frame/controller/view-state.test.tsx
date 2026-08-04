// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createFrameDataFixture } from '../../frame-runtime/react/test-support';
import { requestFrameCalloutEdit, useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { useInteractiveFrameViewState } from './view-state';

let latestIsCalloutEditing = false;

function Harness(props: { frameId: string }) {
  latestIsCalloutEditing = useInteractiveFrameViewState({
    defaultEffectMode: 'border',
    frame: createFrameDataFixture(props.frameId),
  }).isCalloutEditing;
  return null;
}

afterEach(() => {
  useFrameUIStore.getState().reset();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('starts callout editing only for the frame owning the one-shot request', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  requestFrameCalloutEdit('new-frame');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(<Harness frameId="new-frame" />));
  expect(latestIsCalloutEditing).toBe(true);

  act(() => root.unmount());
  const secondRoot = createRoot(container);
  act(() => secondRoot.render(<Harness frameId="new-frame" />));
  expect(latestIsCalloutEditing).toBe(false);
  act(() => secondRoot.unmount());
});
