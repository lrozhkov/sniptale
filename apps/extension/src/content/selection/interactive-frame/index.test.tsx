// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createFrameDataFixture } from '../frame-runtime/test-support';

const captured = vi.hoisted(() => ({ contentProps: null as Record<string, unknown> | null }));

vi.mock('./content', () => ({
  InteractiveFrameContent: (props: Record<string, unknown>) => {
    captured.contentProps = props;
    return null;
  },
}));

vi.mock('./controller/render-model', () => ({
  useInteractiveFrameRenderModel: (props: {
    frame: ReturnType<typeof createFrameDataFixture>;
  }) => ({
    currentFrame: props.frame,
    refs: {
      frameRef: { current: null },
      containerRef: { current: null },
      popoverAnchorRef: { current: null },
      stepBadgePopoverAnchorRef: { current: null },
      calloutPopoverAnchorRef: { current: null },
    },
    viewState: {
      activeCalloutIndex: 2,
      aspectRatio: null,
      clearSelection: vi.fn(),
      closePopover: vi.fn(),
      effectMode: 'border',
      hoverFrame: vi.fn(),
      isCalloutEditing: true,
      maintainAspectRatio: false,
      scheduleHoverFrameHide: vi.fn(),
      selectFrame: vi.fn(),
      setActiveCalloutIndex: vi.fn(),
      setAspectRatio: vi.fn(),
      setIsCalloutEditing: vi.fn(),
      setMaintainAspectRatio: vi.fn(),
      setState: vi.fn(),
      setTempFrame: vi.fn(),
      state: 'idle',
      tempFrame: props.frame,
      togglePopover: vi.fn(),
    },
    borderColor: '#f97316',
    borderWidth: 2,
    fillStyle: {},
    frameStyle: {},
    strokeStyle: {},
    frameZIndex: 1,
    handleCancel: vi.fn(),
    handleDelete: vi.fn(),
    handleEffectButtonClick: vi.fn(),
    handleEffectModeSelect: vi.fn(),
    handleMouseDown: vi.fn(),
    handleResizeStart: vi.fn(),
    handleSave: vi.fn(),
    handleStartEditing: vi.fn(),
    isCalloutPopoverOpen: true,
    isFrameActive: true,
    isHovered: false,
    isPopoverOpen: false,
    isResizeHovered: false,
    isSelected: false,
    isStepBadgePopoverOpen: false,
    sizePanelCoords: { x: 0, y: 0 },
    toolbarCoords: { x: 0, y: 0 },
  }),
}));

import { InteractiveFrame } from '.';

afterEach(() => {
  document.body.replaceChildren();
  captured.contentProps = null;
});

it('forwards the active callout identity and setter through the interactive frame owner', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <InteractiveFrame
        frame={createFrameDataFixture('frame-1')}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        zIndex={1}
      />
    );
  });

  expect(captured.contentProps).toMatchObject({
    activeCalloutIndex: 2,
    isCalloutEditing: true,
  });
  expect(captured.contentProps?.['setActiveCalloutIndex']).toBeTypeOf('function');
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
