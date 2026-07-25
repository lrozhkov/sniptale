// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';

const frameUiStoreMocks = vi.hoisted(() => ({
  dismissFrameUiMock: vi.fn(),
}));

vi.mock('../state/frame-ui.store', () => ({
  useFrameUIStore: {
    getState: () => ({
      dismissFrameUi: frameUiStoreMocks.dismissFrameUiMock,
    }),
  },
}));

import { dispatchHighlighterModeChanged } from '../../../platform/page-context/mode-events';
import { useFrameUiStoreSync } from './effects';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createMutableRef<T>(value: T) {
  return { current: value };
}

function renderHarness(props: {
  selectedFrameId: string | null;
  activePopover: { frameId: string; kind: 'frame-settings' } | null;
}) {
  function Harness() {
    useFrameUiStoreSync({
      hoveredFrameId: null,
      hoveredFrameIdRef: createMutableRef<string | null>(null),
      selectedFrameId: props.selectedFrameId,
      selectedFrameIdRef: createMutableRef<string | null>(null),
      frames: [],
      framesRef: createMutableRef<FrameData[]>([]),
      activePopover: props.activePopover,
      activePopoverRef: createMutableRef<{
        frameId: string;
        kind: 'frame-settings' | 'step-badge' | 'callout-settings';
      } | null>(null),
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
  frameUiStoreMocks.dismissFrameUiMock.mockReset();
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
    renderHarness({ selectedFrameId: 'frame-1', activePopover: null });

    act(() => {
      dispatchHighlighterModeChanged({ enabled: false });
    });

    expect(frameUiStoreMocks.dismissFrameUiMock).toHaveBeenCalledTimes(1);
  });

  it('does not force tooltip hide when highlighter mode stays enabled', () => {
    renderHarness({ selectedFrameId: 'frame-1', activePopover: null });

    act(() => {
      dispatchHighlighterModeChanged({ enabled: true });
    });

    expect(frameUiStoreMocks.dismissFrameUiMock).not.toHaveBeenCalled();
  });
});
