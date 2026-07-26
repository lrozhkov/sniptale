// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  createBorderSettingsFixture,
  createFrameDataFixture,
} from '../../frame-runtime/react/test-support';
import { InteractiveFramePopovers } from './popovers';

const frameSettingsPopoverMock = vi.hoisted(() => vi.fn((_props: Record<string, unknown>) => null));
const stepBadgePopoverMock = vi.hoisted(() => vi.fn((_props: Record<string, unknown>) => null));
const calloutSettingsPopoverMock = vi.hoisted(() =>
  vi.fn((_props: Record<string, unknown>) => null)
);

vi.mock('../../frame-settings-popover', () => ({
  FrameSettingsPopover: frameSettingsPopoverMock,
}));

vi.mock('../../step-badge-popover', () => ({
  StepBadgePopover: stepBadgePopoverMock,
}));

vi.mock('../../callout-settings-popover', () => ({
  CalloutSettingsPopover: calloutSettingsPopoverMock,
}));

vi.mock('./callout', () => ({
  InteractiveFrameCalloutOverlay: () => null,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(node);
  });
}

function createFrame(id: string, borderColor: string): FrameData {
  return createFrameDataFixture(id, {
    borderSettings: createBorderSettingsFixture({
      color: borderColor,
      id: `${id}-preset`,
      name: 'Preset',
      opacity: 100,
      radius: 6,
      width: 3,
    }),
  });
}

function createPopoversProps(args: {
  currentFrame: FrameData;
  frame: FrameData;
  onUpdate?: ((frame: FrameData) => void) | undefined;
  setTempFrame?: React.Dispatch<React.SetStateAction<FrameData>> | undefined;
}) {
  return {
    frame: args.frame,
    currentFrame: args.currentFrame,
    frameZIndex: 100,
    borderWidth: 3,
    effectMode: 'border' as const,
    isPopoverOpen: true,
    isSelected: true,
    isStepBadgePopoverOpen: false,
    isCalloutPopoverOpen: false,
    isCalloutEditing: false,
    popoverAnchorRef: { current: null },
    stepBadgePopoverAnchorRef: { current: null },
    calloutPopoverAnchorRef: { current: null },
    setIsCalloutEditing: vi.fn(),
    setTempFrame: args.setTempFrame ?? vi.fn(),
    closePopover: vi.fn(),
    onUpdate: args.onUpdate ?? vi.fn(),
  };
}

function getFrameSettingsPopoverProps() {
  const frameSettingsProps = frameSettingsPopoverMock.mock.calls.at(0)?.at(0);
  expect(frameSettingsProps).toBeDefined();
  return frameSettingsProps as unknown as {
    borderSettings: FrameData['borderSettings'];
    frameId: string;
    onApplyToFrame: (settings: { borderSettings?: FrameData['borderSettings'] }) => void;
  };
}

function renderPopovers(
  frame: FrameData,
  currentFrame: FrameData,
  handlers?: {
    onUpdate?: ((frame: FrameData) => void) | undefined;
    setTempFrame?: React.Dispatch<React.SetStateAction<FrameData>> | undefined;
  }
) {
  renderNode(
    <InteractiveFramePopovers
      {...createPopoversProps({
        currentFrame,
        frame,
        onUpdate: handlers?.onUpdate,
        setTempFrame: handlers?.setTempFrame,
      })}
    />
  );
}

describe('InteractiveFramePopovers', () => {
  it('binds frame-settings popover state to the current editing frame', () => {
    const frame = createFrame('frame-1', '#2563eb');
    const currentFrame = createFrame('frame-1', '#f97316');

    renderPopovers(frame, currentFrame);
    const frameSettingsProps = getFrameSettingsPopoverProps();

    expect(frameSettingsProps.frameId).toBe(currentFrame.id);
    expect(frameSettingsProps.borderSettings).toEqual(currentFrame.borderSettings);
  });

  it('applies frame-settings patches to both tempFrame and the authoritative frame', () => {
    const frame = createFrame('frame-1', '#2563eb');
    const currentFrame = createFrame('frame-1', '#f97316');
    const nextBorderSettings = createBorderSettingsFixture({
      color: '#22c55e',
      id: 'preset-next',
      name: 'Next',
      opacity: 100,
      radius: 10,
      width: 4,
    });
    const onUpdate = vi.fn();
    const setTempFrame = vi.fn() as React.Dispatch<React.SetStateAction<FrameData>>;

    renderPopovers(frame, currentFrame, { onUpdate, setTempFrame });
    const frameSettingsProps = getFrameSettingsPopoverProps();

    act(() => {
      frameSettingsProps.onApplyToFrame({ borderSettings: nextBorderSettings });
    });

    const expectedFrame = {
      ...currentFrame,
      borderSettings: nextBorderSettings,
    };

    expect(setTempFrame).toHaveBeenCalledWith(expectedFrame);
    expect(onUpdate).toHaveBeenCalledWith(expectedFrame);
  });

  it('opens quick step and callout settings popovers without selecting the frame', () => {
    const frame = createFrame('frame-1', '#2563eb');
    const props = createPopoversProps({ currentFrame: frame, frame });

    renderNode(
      <InteractiveFramePopovers
        {...props}
        isSelected={false}
        isStepBadgePopoverOpen
        isCalloutPopoverOpen
        frame={{
          ...frame,
          stepBadge: { enabled: true, type: 'number', value: '1' },
          callout: {
            anchor: 'top-center',
            bgColor: '#fff',
            enabled: true,
            fontFamily: 'sans',
            fontSize: 14,
            fontWeight: 'normal',
            htmlContent: 'Comment',
            maxWidth: 200,
            side: 'auto',
            tailSize: 8,
            textColor: '#111',
            variant: 'bubble',
          },
        }}
      />
    );

    expect(stepBadgePopoverMock).toHaveBeenCalledWith(
      expect.objectContaining({ isOpen: true }),
      undefined
    );
    expect(calloutSettingsPopoverMock).toHaveBeenCalledWith(
      expect.objectContaining({ isOpen: true }),
      undefined
    );
  });
});
