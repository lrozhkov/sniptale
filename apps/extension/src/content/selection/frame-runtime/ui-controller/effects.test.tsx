// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';

const frameUiStoreMocks = vi.hoisted(() => ({
  forceHideTooltipMock: vi.fn(),
}));

const highlighterMocks = vi.hoisted(() => ({
  clearFrameTooltipVisibleMock: vi.fn(),
  setFrameTooltipVisibleMock: vi.fn(),
}));

vi.mock('../state/frame-ui.store', () => ({
  useFrameUIStore: {
    getState: () => ({
      forceHideTooltip: frameUiStoreMocks.forceHideTooltipMock,
    }),
  },
}));

vi.mock('../../highlighter', () => ({
  clearFrameTooltipVisible: highlighterMocks.clearFrameTooltipVisibleMock,
  setFrameTooltipVisible: highlighterMocks.setFrameTooltipVisibleMock,
}));

import { dispatchHighlighterModeChanged } from '../../../platform/page-context/mode-events';
import { useFrameUiStoreSync } from './effects';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createMutableRef<T>(value: T) {
  return { current: value };
}

function renderHarness(props: { activeFrameId: string | null; popoverFrameId: string | null }) {
  function Harness() {
    useFrameUiStoreSync({
      activeFrameId: props.activeFrameId,
      activeFrameIdRef: createMutableRef<string | null>(null),
      frames: [],
      framesRef: createMutableRef<FrameData[]>([]),
      popoverFrameId: props.popoverFrameId,
      popoverFrameIdRef: createMutableRef<string | null>(null),
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
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  frameUiStoreMocks.forceHideTooltipMock.mockReset();
  highlighterMocks.clearFrameTooltipVisibleMock.mockReset();
  highlighterMocks.setFrameTooltipVisibleMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('useFrameUiStoreSync', () => {
  it('forces tooltip hide when highlighter mode is disabled', () => {
    renderHarness({ activeFrameId: 'frame-1', popoverFrameId: null });

    act(() => {
      dispatchHighlighterModeChanged({ enabled: false });
    });

    expect(frameUiStoreMocks.forceHideTooltipMock).toHaveBeenCalledTimes(1);
  });

  it('does not force tooltip hide when highlighter mode stays enabled', () => {
    renderHarness({ activeFrameId: 'frame-1', popoverFrameId: null });

    act(() => {
      dispatchHighlighterModeChanged({ enabled: true });
    });

    expect(frameUiStoreMocks.forceHideTooltipMock).not.toHaveBeenCalled();
  });
});
