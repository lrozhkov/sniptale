// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createFrameDataFixture } from '../../frame-runtime/react/test-support';
import { requestFrameCalloutEdit, useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { useInteractiveFrameViewState } from './view-state';
import { createDefaultFrameCallout } from '../../../../features/highlighter/frame-annotation/defaults';
import { useInteractiveFramePropSync } from './lifecycle';

let latestIsCalloutEditing = false;
let latestViewState: ReturnType<typeof useInteractiveFrameViewState> | null = null;

function Harness(props: { calloutEnabled?: boolean; frameId: string; withCallout?: boolean }) {
  const frame = createFrameDataFixture(props.frameId, {
    ...(props.withCallout
      ? {
          callout: {
            ...createDefaultFrameCallout(),
            enabled: props.calloutEnabled ?? true,
          },
        }
      : {}),
  });
  latestViewState = useInteractiveFrameViewState({
    defaultEffectMode: 'border',
    frame,
  });
  useInteractiveFramePropSync({
    defaultEffectMode: 'border',
    frame,
    isCalloutEditing: latestViewState.isCalloutEditing,
    isResizingRef: { current: false },
    setEffectMode: latestViewState.setEffectMode,
    setState: latestViewState.setState,
    setTempFrame: latestViewState.setTempFrame,
    state: latestViewState.state,
  });
  latestIsCalloutEditing = latestViewState.isCalloutEditing;
  return null;
}

afterEach(() => {
  useFrameUIStore.getState().reset();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  latestViewState = null;
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

it('adopts a newly enabled primary callout while its editor is already requested', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(<Harness frameId="frame-1" />));
  act(() => latestViewState?.setIsCalloutEditing(true));
  act(() => root.render(<Harness frameId="frame-1" withCallout />));

  expect(latestViewState?.isCalloutEditing).toBe(true);
  expect(latestViewState?.tempFrame.callout).toMatchObject({ enabled: true });

  act(() => root.unmount());
});

it('replaces a disabled local primary callout when the owner enables it again', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(<Harness calloutEnabled={false} frameId="frame-1" withCallout />));
  act(() => latestViewState?.setIsCalloutEditing(true));
  act(() => root.render(<Harness calloutEnabled frameId="frame-1" withCallout />));

  expect(latestViewState?.isCalloutEditing).toBe(true);
  expect(latestViewState?.tempFrame.callout).toMatchObject({ enabled: true });

  act(() => root.unmount());
});
