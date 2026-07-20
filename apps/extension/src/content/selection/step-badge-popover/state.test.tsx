// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { addFrameStepBadgeChangedListener } from '../../platform/page-context/frame-events';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { useStepBadgePopoverState } from './state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useStepBadgePopoverState> | null = null;
let onCloseSpy: Mock<() => void> | null = null;
let isOpen = true;
let currentStepBadge: StepBadgeSettings | undefined;

function Harness() {
  const props = {
    anchorEl: null,
    frameId: 'frame-1',
    isOpen,
    onClose: () => onCloseSpy?.(),
    ...(currentStepBadge === undefined ? {} : { stepBadge: currentStepBadge }),
  };

  latestState = useStepBadgePopoverState({
    ...props,
  });

  return null;
}

function renderHarness(stepBadge?: StepBadgeSettings, nextIsOpen = true) {
  currentStepBadge = stepBadge;
  isOpen = nextIsOpen;
  onCloseSpy = vi.fn<() => void>();

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestState = null;
  currentStepBadge = undefined;
  isOpen = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  onCloseSpy = null;
  vi.restoreAllMocks();
});

function verifyDisablesBadgeAndCloses() {
  const listener = vi.fn();
  const cleanup = addFrameStepBadgeChangedListener(listener);

  renderHarness();
  act(() => {
    latestState?.handleEnabledChange(false);
  });

  expect(listener).toHaveBeenCalledWith({
    frameId: 'frame-1',
    settings: { enabled: false },
  });
  expect(onCloseSpy).toHaveBeenCalledTimes(1);

  cleanup();
}

function verifyManualValueDispatch() {
  const listener = vi.fn();
  const cleanup = addFrameStepBadgeChangedListener(listener);

  renderHarness({
    alphabet: 'latin',
    anchor: 'top-left',
    auto: false,
    enabled: true,
    offsetDirections: [],
    sizeLevel: 2,
    type: 'letter',
    value: 'A',
  } as StepBadgeSettings);

  act(() => {
    latestState?.handleValueChange('B');
  });

  expect(listener).toHaveBeenCalledWith({
    frameId: 'frame-1',
    settings: { value: 'B' },
  });

  cleanup();
}

function verifyHistoryCommitOnClose() {
  const beginTransactionSpy = vi.spyOn(pagePreparationHistory, 'beginTransaction');
  const commitTransactionSpy = vi.spyOn(pagePreparationHistory, 'commitTransaction');

  renderHarness();
  expect(beginTransactionSpy).toHaveBeenCalledWith('step-badge:frame-1');
  renderHarness(undefined, false);

  expect(commitTransactionSpy).toHaveBeenCalledWith('step-badge:frame-1');
}

function verifyHistoryCancelOnUnmount() {
  const cancelTransactionSpy = vi.spyOn(pagePreparationHistory, 'cancelTransaction');

  renderHarness();

  act(() => {
    root?.unmount();
  });

  root = null;

  expect(cancelTransactionSpy).toHaveBeenCalledWith('step-badge:frame-1');
}

describe('useStepBadgePopoverState', () => {
  it('dispatches frame step-badge changes and closes when disabled', verifyDisablesBadgeAndCloses);
  it('dispatches manual value changes through the shared event seam', verifyManualValueDispatch);
  it(
    'opens and commits a grouped history transaction around the popover session',
    verifyHistoryCommitOnClose
  );
  it(
    'cancels an open history transaction when the popover unmounts mid-session',
    verifyHistoryCancelOnUnmount
  );
});
