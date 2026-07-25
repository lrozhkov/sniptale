// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createFrameDataFixture } from '../../frame-runtime/test-support';

const owners = vi.hoisted(() => ({
  floating: vi.fn(() => null),
  popovers: vi.fn(() => null),
  shell: vi.fn(() => null),
}));

vi.mock('../frame/shell', () => ({ InteractiveFrameFrameShell: owners.shell }));
vi.mock('../overlays/floating', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../overlays/floating')>()),
  InteractiveFrameFloatingUi: owners.floating,
}));
vi.mock('../overlays/popovers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../overlays/popovers')>()),
  InteractiveFramePopovers: owners.popovers,
}));

import { InteractiveFrameContent } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

function createProps(): React.ComponentProps<typeof InteractiveFrameContent> {
  const frame = createFrameDataFixture('frame-1');
  return {
    aspectRatio: null,
    borderColor: '#ff671d',
    borderWidth: 2,
    calloutPopoverAnchorRef: { current: null },
    closePopover: vi.fn(),
    clearSelection: vi.fn(),
    containerRef: { current: null },
    currentFrame: frame,
    effectMode: 'border',
    frame,
    frameRef: { current: null },
    frameStyle: {},
    frameZIndex: 100,
    handleCancel: vi.fn(),
    handleDelete: vi.fn(),
    handleEffectButtonClick: vi.fn(),
    handleMouseDown: vi.fn(),
    handleResizeStart: vi.fn(),
    handleSave: vi.fn(),
    handleStartEditing: vi.fn(),
    hoverFrame: vi.fn(),
    scheduleHoverFrameHide: vi.fn(),
    selectFrame: vi.fn(),
    isCalloutEditing: false,
    toolbarAnchorOffset: null,
    isCalloutPopoverOpen: false,
    isFrameActive: true,
    isHovered: false,
    isSelected: true,
    isPopoverOpen: false,
    isResizeHovered: true,
    isStepBadgePopoverOpen: false,
    maintainAspectRatio: false,
    onUpdate: vi.fn(),
    popoverAnchorRef: { current: null },
    setAspectRatio: vi.fn(),
    setIsCalloutEditing: vi.fn(),
    togglePopover: vi.fn(),
    setMaintainAspectRatio: vi.fn(),
    setState: vi.fn(),
    setTempFrame: vi.fn(),
    sizePanelCoords: { x: 0, y: 0 },
    state: 'hover',
    stepBadgePopoverAnchorRef: { current: null },
    tempFrame: frame,
    toolbarCoords: { x: 10, y: 10 },
  };
}

it('routes resize chrome and current geometry to their dedicated render owners', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const props = createProps();

  act(() => root?.render(<InteractiveFrameContent {...props} />));

  expect(owners.shell).toHaveBeenCalledWith(
    expect.objectContaining({ currentFrame: props.currentFrame, isResizeHovered: true }),
    undefined
  );
  expect(owners.floating).toHaveBeenCalledWith(
    expect.objectContaining({ frame: props.currentFrame }),
    undefined
  );
  expect(owners.popovers).toHaveBeenCalledWith(
    expect.objectContaining({ currentFrame: props.currentFrame }),
    undefined
  );
});
