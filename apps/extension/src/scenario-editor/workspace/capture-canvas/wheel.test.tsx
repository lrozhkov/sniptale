// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import type { ScenarioStepPatch } from '../../project/mutation/helpers';
import { useScenarioWorkspaceWheelSession } from './wheel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Capture',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1200, height: 800 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  });
}

function WheelProbe(props: {
  onUpdateStep: (patch: ScenarioStepPatch) => void;
  setDraftPatch: (patch: ScenarioStepPatch | null) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);

  useScenarioWorkspaceWheelSession({
    onUpdateStep: props.onUpdateStep,
    setDraftPatch: props.setDraftPatch,
    stageRef,
    step: createStep(),
  });

  return <div ref={stageRef} data-testid="wheel-stage" />;
}

function expectStage(): HTMLDivElement {
  const stage = container?.querySelector<HTMLDivElement>('[data-testid="wheel-stage"]');
  expect(stage).not.toBeNull();
  if (!stage) {
    throw new Error('Expected wheel stage');
  }

  return stage;
}

function mountWheelProbe() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

function unmountWheelProbe() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
}

function verifiesUnmountFlush() {
  const onUpdateStep = vi.fn();
  const setDraftPatch = vi.fn();

  act(() => {
    root?.render(<WheelProbe onUpdateStep={onUpdateStep} setDraftPatch={setDraftPatch} />);
  });

  const stage = expectStage();
  const wheelEvent = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: -10,
  });

  act(() => {
    stage.dispatchEvent(wheelEvent);
  });

  expect(onUpdateStep).not.toHaveBeenCalled();
  expect(wheelEvent.defaultPrevented).toBe(true);

  act(() => {
    root?.unmount();
  });

  expect(onUpdateStep).toHaveBeenCalledTimes(1);
  expect(setDraftPatch).toHaveBeenCalledWith(
    expect.objectContaining({ imageTransform: expect.any(Object) })
  );
}

function verifiesTimerFlush() {
  const onUpdateStep = vi.fn();
  const setDraftPatch = vi.fn();

  act(() => {
    root?.render(<WheelProbe onUpdateStep={onUpdateStep} setDraftPatch={setDraftPatch} />);
  });

  act(() => {
    expectStage().dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 10 })
    );
    vi.advanceTimersByTime(300);
  });

  expect(onUpdateStep).toHaveBeenCalledTimes(1);
  expect(setDraftPatch).toHaveBeenLastCalledWith(
    expect.objectContaining({ imageTransform: expect.any(Object) })
  );

  act(() => {
    root?.unmount();
  });

  expect(onUpdateStep).toHaveBeenCalledTimes(1);
}

describe('useScenarioWorkspaceWheelSession', () => {
  beforeEach(mountWheelProbe);
  afterEach(unmountWheelProbe);

  it(
    'flushes a pending wheel patch during cleanup when the stage unmounts before the timer fires',
    verifiesUnmountFlush
  );
  it(
    'commits the pending wheel patch when the debounce timer fires and does not double-commit on cleanup',
    verifiesTimerFlush
  );
});
