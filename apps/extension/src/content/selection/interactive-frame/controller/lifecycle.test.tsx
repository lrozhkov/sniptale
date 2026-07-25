// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';

import {
  dispatchExitFrameEditing,
  dispatchHighlighterModeChanged,
} from '../../../platform/page-context/mode-events';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import {
  useInteractiveFrameExternalExitEffects,
  useInteractiveFrameHistoryApplyReset,
  useInteractiveFramePropSync,
} from './lifecycle';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let handleCancelSpy: Mock<() => void> | null = null;
let abortPointerSessionSpy: Mock<() => boolean> | null = null;
let setStateSpy: Mock<(state: FrameState) => void> | null = null;
const frame: FrameData = {
  id: 'frame-1',
  x: 10,
  y: 20,
  width: 120,
  height: 80,
  effectMode: 'focus' as const,
};

function renderHarness(state: FrameState, hasPointerSession = false) {
  handleCancelSpy = vi.fn<() => void>();
  abortPointerSessionSpy = vi.fn<() => boolean>(() => hasPointerSession);
  setStateSpy = vi.fn<(state: FrameState) => void>();

  function Harness() {
    useInteractiveFrameExternalExitEffects({
      abortPointerSession: () => abortPointerSessionSpy?.() ?? false,
      handleCancel: () => handleCancelSpy?.(),
      setState: (nextState) => {
        if (typeof nextState !== 'function') setStateSpy?.(nextState);
      },
      state,
    });
    return null;
  }

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
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(pagePreparationHistory, 'cancelTransaction').mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  handleCancelSpy = null;
  abortPointerSessionSpy = null;
  setStateSpy = null;
  vi.useRealTimers();
});

describe('useInteractiveFrameExternalExitEffects', () => {
  it('cancels editing when an exit-frame-editing event is emitted', () => {
    renderHarness('editing');

    act(() => {
      dispatchExitFrameEditing();
    });

    expect(handleCancelSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels editing when highlighter mode changes while editing', () => {
    renderHarness('editing');

    act(() => {
      dispatchHighlighterModeChanged({ enabled: false });
    });

    expect(handleCancelSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps editing active when highlighter mode stays enabled', () => {
    renderHarness('editing');

    act(() => {
      dispatchHighlighterModeChanged({ enabled: true });
    });

    expect(handleCancelSpy).not.toHaveBeenCalled();
    expect(abortPointerSessionSpy).not.toHaveBeenCalled();
  });

  it('aborts a transient resize when highlighter mode is disabled', () => {
    renderHarness('resizing', true);

    act(() => {
      dispatchHighlighterModeChanged({ enabled: false });
    });

    expect(abortPointerSessionSpy).toHaveBeenCalledOnce();
    expect(setStateSpy).toHaveBeenCalledWith('idle');
    expect(handleCancelSpy).not.toHaveBeenCalled();
  });

  it('ignores exit events while the frame is not being edited', () => {
    renderHarness('idle');

    act(() => {
      dispatchExitFrameEditing();
      dispatchHighlighterModeChanged({ enabled: false });
    });

    expect(handleCancelSpy).not.toHaveBeenCalled();
  });
});

function HistoryApplyHarness(props: { frame: FrameData }) {
  const [state, setState] = React.useState<FrameState>('editing');
  const [tempFrame, setTempFrame] = React.useState<FrameData>({ ...props.frame, x: 200 });
  const [effectMode, setEffectMode] = React.useState<'border' | 'blur' | 'focus'>('blur');
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(true);
  const [isCalloutEditing, setIsCalloutEditing] = React.useState(true);

  useInteractiveFrameHistoryApplyReset({
    abortPointerSession: () => abortPointerSessionSpy?.() ?? false,
    closePopover: () => setIsPopoverOpen(false),
    defaultEffectMode: 'border',
    frame: props.frame,
    setEffectMode,
    setIsCalloutEditing,
    setState,
    setTempFrame,
  });

  return (
    <div
      data-callout-editing={String(isCalloutEditing)}
      data-popover-open={String(isPopoverOpen)}
      data-effect-mode={effectMode}
      data-state={state}
      data-temp-x={String(tempFrame.x)}
    />
  );
}

function renderHistoryApplyHarness(initialFrame: FrameData = frame) {
  abortPointerSessionSpy = vi.fn<() => boolean>(() => true);
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<HistoryApplyHarness frame={initialFrame} />);
  });

  return {
    rerender: (nextFrame: FrameData) => {
      act(() => {
        root?.render(<HistoryApplyHarness frame={nextFrame} />);
      });
    },
  };
}

function flushHistoryApplyTimers() {
  act(() => {
    vi.runAllTimers();
  });
}

function renderPropSyncHarness(initialFrame: FrameData) {
  function Harness(props: { frame: FrameData }) {
    const [state] = React.useState<'idle' | 'hover' | 'editing'>('idle');
    const [tempFrame, setTempFrame] = React.useState<FrameData>({
      ...props.frame,
      x: 200,
    });
    const [effectMode, setEffectMode] = React.useState<'border' | 'blur' | 'focus'>('blur');

    useInteractiveFramePropSync({
      defaultEffectMode: 'border',
      frame: props.frame,
      isCalloutEditing: false,
      setEffectMode,
      setTempFrame,
      state,
    });

    return <div data-effect-mode={effectMode} data-temp-x={String(tempFrame.x)} />;
  }

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness frame={initialFrame} />);
  });

  return {
    rerender: (nextFrame: FrameData) => {
      act(() => {
        root?.render(<Harness frame={nextFrame} />);
      });
    },
  };
}

describe('useInteractiveFrameHistoryApplyReset', () => {
  it('resets transient frame UI state and cancels grouped transactions after history apply', () => {
    renderHistoryApplyHarness();

    act(() => {
      window.dispatchEvent(new CustomEvent('sniptale-page-preparation-history-applied'));
    });
    flushHistoryApplyTimers();

    const node = container?.firstElementChild;

    expect(node?.getAttribute('data-state')).toBe('idle');
    expect(node?.getAttribute('data-effect-mode')).toBe('focus');
    expect(node?.getAttribute('data-temp-x')).toBe('10');
    expect(node?.getAttribute('data-popover-open')).toBe('false');
    expect(node?.getAttribute('data-callout-editing')).toBe('false');
    expect(abortPointerSessionSpy).toHaveBeenCalledOnce();
    expect(pagePreparationHistory.cancelTransaction).toHaveBeenCalledWith(
      'callout-editing:frame-1'
    );
    expect(pagePreparationHistory.cancelTransaction).toHaveBeenCalledWith(
      'callout-settings:frame-1'
    );
    expect(pagePreparationHistory.cancelTransaction).toHaveBeenCalledWith('frame-settings:frame-1');
    expect(pagePreparationHistory.cancelTransaction).toHaveBeenCalledWith('step-badge:frame-1');
  });

  it('uses the latest frame props when history apply reverts the effect mode', () => {
    const historyHarness = renderHistoryApplyHarness({
      ...frame,
      effectMode: 'blur',
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('sniptale-page-preparation-history-applied'));
    });
    historyHarness.rerender({
      ...frame,
      effectMode: 'border',
    });
    flushHistoryApplyTimers();

    expect(container?.firstElementChild?.getAttribute('data-effect-mode')).toBe('border');
  });
});

describe('useInteractiveFramePropSync', () => {
  it('syncs local effect mode and temp frame from reverted frame props while idle', () => {
    const propSyncHarness = renderPropSyncHarness({
      ...frame,
      effectMode: 'blur',
    });

    propSyncHarness.rerender({
      ...frame,
      effectMode: 'border',
    });

    expect(container?.firstElementChild?.getAttribute('data-effect-mode')).toBe('border');
    expect(container?.firstElementChild?.getAttribute('data-temp-x')).toBe('10');
  });
});
