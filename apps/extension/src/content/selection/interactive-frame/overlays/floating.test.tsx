// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCalloutSettingsFixture,
  createFrameDataFixture,
} from '../../frame-runtime/test-support';

vi.mock('../toolbar', () => ({
  InteractiveFrameToolbar: (props: { captureVisibility: { hiddenDuringCapture: boolean } }) => (
    <output
      data-ui="test.selected-frame-toolbar-visibility"
      data-hidden={String(props.captureVisibility.hiddenDuringCapture)}
    />
  ),
}));

vi.mock('../toolbar/trigger', () => ({
  InteractiveFrameToolbarTrigger: (props: {
    captureVisibility: { hiddenDuringCapture: boolean; toggle: () => void };
    canAddCallout?: boolean;
    frame: ReturnType<typeof createFrameDataFixture>;
  }) => (
    <button
      type="button"
      data-ui="test.frame-trigger-visibility"
      data-hidden={String(props.captureVisibility.hiddenDuringCapture)}
      data-additional-count={String(props.frame.additionalCallouts?.length ?? 0)}
      data-can-add-callout={String(props.canAddCallout)}
      onClick={props.captureVisibility.toggle}
    />
  ),
}));

vi.mock('../size-panel', () => ({ InteractiveFrameSizePanel: () => null }));
vi.mock('./blocking', () => ({ InteractiveFrameBlockingOverlays: () => null }));

import { InteractiveFrameFloatingUi } from './floating';

function createProps(): React.ComponentProps<typeof InteractiveFrameFloatingUi> {
  const frame = createFrameDataFixture('frame-1');
  return {
    aspectRatio: null,
    calloutPopoverAnchorRef: { current: null },
    clearSelection: vi.fn(),
    closePopover: vi.fn(),
    effectMode: 'border',
    frame,
    frameId: frame.id,
    handleCancel: vi.fn(),
    handleDelete: vi.fn(),
    handleEffectButtonClick: vi.fn(),
    handleSave: vi.fn(),
    handleStartEditing: vi.fn(),
    hoverFrame: vi.fn(),
    isCalloutEditing: false,
    isFrameActive: true,
    isHovered: true,
    isSelected: false,
    maintainAspectRatio: false,
    onUpdate: vi.fn(),
    popoverAnchorRef: { current: null },
    scheduleHoverFrameHide: vi.fn(),
    selectFrame: vi.fn(),
    setAspectRatio: vi.fn(),
    setIsCalloutEditing: vi.fn(),
    setMaintainAspectRatio: vi.fn(),
    setState: vi.fn(),
    setTempFrame: vi.fn(),
    sizePanelCoords: { x: 0, y: 0 },
    state: 'hover',
    stepBadgePopoverAnchorRef: { current: null },
    tempFrame: frame,
    togglePopover: vi.fn(),
    toolbarAnchorOffset: null,
    toolbarCoords: { x: 0, y: 0 },
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('InteractiveFrameFloatingUi', () => {
  it('feeds staged callouts to the mini trigger while a new comment is being edited', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const props = createProps();
    props.isCalloutEditing = true;
    props.tempFrame = {
      ...props.frame,
      additionalCallouts: Array.from({ length: 4 }, () => createCalloutSettingsFixture()),
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(<InteractiveFrameFloatingUi {...props} />));

    expect(
      container.querySelector<HTMLElement>('[data-ui="test.frame-trigger-visibility"]')?.dataset[
        'additionalCount'
      ]
    ).toBe('4');
    expect(
      container.querySelector<HTMLElement>('[data-ui="test.frame-trigger-visibility"]')?.dataset[
        'canAddCallout'
      ]
    ).toBe('false');
    act(() => root.unmount());
  });

  it('keeps the mini trigger on the staged callout limit after comment editing stops', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const props = createProps();
    props.frame = {
      ...props.frame,
      callout: createCalloutSettingsFixture(),
      additionalCallouts: Array.from({ length: 3 }, () => createCalloutSettingsFixture()),
    };
    props.tempFrame = {
      ...props.frame,
      additionalCallouts: Array.from({ length: 4 }, () => createCalloutSettingsFixture()),
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(<InteractiveFrameFloatingUi {...props} />));

    expect(
      container.querySelector<HTMLElement>('[data-ui="test.frame-trigger-visibility"]')?.dataset[
        'additionalCount'
      ]
    ).toBe('4');
    expect(
      container.querySelector<HTMLElement>('[data-ui="test.frame-trigger-visibility"]')?.dataset[
        'canAddCallout'
      ]
    ).toBe('false');
    act(() => root.unmount());
  });

  it('keeps the mini action owned by the staged collection while the persisted frame catches up', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const props = createProps();
    props.frame = {
      ...props.frame,
      callout: createCalloutSettingsFixture(),
      additionalCallouts: Array.from({ length: 4 }, () => createCalloutSettingsFixture()),
    };
    props.tempFrame = {
      ...props.frame,
      additionalCallouts: Array.from({ length: 3 }, () => createCalloutSettingsFixture()),
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(<InteractiveFrameFloatingUi {...props} />));

    const trigger = container.querySelector<HTMLElement>(
      '[data-ui="test.frame-trigger-visibility"]'
    );
    expect(trigger?.dataset['additionalCount']).toBe('3');
    expect(trigger?.dataset['canAddCallout']).toBe('true');
    act(() => root.unmount());
  });

  it('shares capture visibility between the frame action and selected toolbar immediately', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const props = createProps();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(<InteractiveFrameFloatingUi {...props} />));
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-ui="test.frame-trigger-visibility"]'
    );
    const selectedToolbar = () =>
      container.querySelector<HTMLOutputElement>(
        '[data-ui="test.selected-frame-toolbar-visibility"]'
      );

    expect(trigger?.dataset['hidden']).toBe('false');
    expect(selectedToolbar()?.dataset['hidden']).toBe('false');
    act(() => trigger?.click());

    expect(trigger?.dataset['hidden']).toBe('true');
    expect(selectedToolbar()?.dataset['hidden']).toBe('true');
    expect(props.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        borderSettings: expect.objectContaining({
          effects: expect.objectContaining({ capture: { hideFrame: true } }),
        }),
      })
    );

    act(() => root.unmount());
  });
});
