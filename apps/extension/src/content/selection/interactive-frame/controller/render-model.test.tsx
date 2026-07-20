// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  calculateInteractiveFrameSizePanelPosition,
  calculateInteractiveFrameToolbarPosition,
} from '../layout/positioning';

const renderModelMocks = vi.hoisted(() => ({
  storeState: {
    activeFrameId: null as string | null,
    popoverFrameId: null as string | null,
    openPopover: vi.fn(),
    closePopover: vi.fn(),
    hideTooltip: vi.fn(),
  },
}));

vi.mock('../render-model/render-model', () => ({
  getInteractiveFrameDisplay: () => ({
    frameStyle: {},
    frameZIndex: 12,
    borderColor: '#2563eb',
    borderWidth: 2,
    borderShadow: undefined,
  }),
  useInteractiveFrameRenderRefs: () => ({
    frameRef: { current: null },
    containerRef: { current: null },
    popoverAnchorRef: { current: null },
    stepBadgePopoverAnchorRef: { current: null },
    calloutPopoverAnchorRef: { current: null },
    startFrameRef: { current: null },
    startEffectModeRef: { current: null },
    handleSaveRef: { current: vi.fn() },
    handleCancelRef: { current: vi.fn() },
    handleDeleteRef: { current: vi.fn() },
  }),
}));

vi.mock('./actions', () => ({
  useInteractiveFrameActions: () => ({
    handleMouseDown: vi.fn(),
    handleResizeStart: vi.fn(),
    handleEffectButtonClick: vi.fn(),
    handleStartEditing: vi.fn(),
    handleSave: vi.fn(),
    handleCancel: vi.fn(),
    handleDelete: vi.fn(),
  }),
}));

vi.mock('./editing', () => ({
  useInteractiveFrameEditing: () => ({}),
}));

vi.mock('../../frame-runtime/state/frame-ui.store', () => ({
  useFrameUIStore: (selector: (state: typeof renderModelMocks.storeState) => unknown) =>
    selector(renderModelMocks.storeState),
}));

vi.mock('../../highlighter', () => ({
  clearFrameEditing: vi.fn(),
  setFrameEditing: vi.fn(),
}));

import { useInteractiveFrameRenderModel } from './render-model';

const baseFrame: FrameData = {
  id: 'frame-1',
  x: 120,
  y: 180,
  width: 240,
  height: 120,
  effectMode: 'border',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function getBaseRenderModelProps() {
  return {
    frame: baseFrame,
    zIndex: 4,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onCancel: vi.fn(),
    onEffectChange: vi.fn(),
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function createSnapshotsHarness(args: {
  snapshots: Array<{
    state: string;
    toolbarCoords: { x: number; y: number };
    sizePanelCoords: { x: number; y: number };
  }>;
  forceEditing?: boolean;
}) {
  const { forceEditing = false, snapshots } = args;

  return function SnapshotsHarness() {
    const model = useInteractiveFrameRenderModel(getBaseRenderModelProps());
    const hasForcedEditingRef = React.useRef(false);
    const { setState, state } = model.viewState;

    React.useEffect(() => {
      if (forceEditing && !hasForcedEditingRef.current) {
        hasForcedEditingRef.current = true;
        setState('editing');
      }
    }, [setState]);

    React.useEffect(() => {
      snapshots.push({
        state,
        toolbarCoords: { ...model.toolbarCoords },
        sizePanelCoords: { ...model.sizePanelCoords },
      });
    });

    return null;
  };
}

async function renderHarness(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  renderModelMocks.storeState.activeFrameId = null;
  renderModelMocks.storeState.popoverFrameId = null;
  renderModelMocks.storeState.openPopover.mockReset();
  renderModelMocks.storeState.closePopover.mockReset();
  renderModelMocks.storeState.hideTooltip.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useInteractiveFrameRenderModel', () => {
  it('never exposes default top-left toolbar coords on hover renders', async () => {
    const snapshots: Array<{
      state: string;
      toolbarCoords: { x: number; y: number };
      sizePanelCoords: { x: number; y: number };
    }> = [];
    const HoverHarness = createSnapshotsHarness({ snapshots });
    const expectedToolbarCoords = calculateInteractiveFrameToolbarPosition(baseFrame);
    renderModelMocks.storeState.activeFrameId = baseFrame.id;

    await renderHarness(<HoverHarness />);
    await flushEffects();

    const hoverSnapshots = snapshots.filter((snapshot) => snapshot.state === 'hover');

    expect(hoverSnapshots.length).toBeGreaterThan(0);
    hoverSnapshots.forEach((snapshot) => {
      expect(snapshot.toolbarCoords).toEqual(expectedToolbarCoords);
    });
  });

  it('never exposes default top-left size-panel coords on editing renders', async () => {
    const snapshots: Array<{
      state: string;
      toolbarCoords: { x: number; y: number };
      sizePanelCoords: { x: number; y: number };
    }> = [];
    const EditingHarness = createSnapshotsHarness({ snapshots, forceEditing: true });
    const expectedSizePanelCoords = calculateInteractiveFrameSizePanelPosition(baseFrame);

    await renderHarness(<EditingHarness />);
    await flushEffects();

    const editingSnapshots = snapshots.filter((snapshot) => snapshot.state === 'editing');

    expect(editingSnapshots.length).toBeGreaterThan(0);
    editingSnapshots.forEach((snapshot) => {
      expect(snapshot.sizePanelCoords).toEqual(expectedSizePanelCoords);
    });
  });
});
