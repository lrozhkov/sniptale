// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  createBorderSettingsFixture,
  createCalloutSettingsFixture,
  createFrameDataFixture,
} from '../../frame-runtime/react/test-support';
import { InteractiveFrameCalloutOverlay } from './callout';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';

vi.mock('../../callout', () => ({
  Callout: (props: {
    frameRect: { x: number; y: number; width: number; height: number };
    onContentChange: (html: string) => void;
    onPositionChange: (
      placement: { centerOffsetX: number; centerOffsetY: number },
      behavior: {
        connectorBasePosition?: number;
        connectorBaseWidth?: number;
        connectorFramePosition?: number;
        connectorWaypoint?: { centerOffsetX: number; centerOffsetY: number };
        translateConnectorGeometry: boolean;
      }
    ) => void;
    onSettingsClick: () => void;
    onTailBaseRangeChange: (position: number, width: number) => void;
    onTailFramePositionChange: (position: number) => void;
    onWidthChange: (
      maxWidth: number,
      placement: { centerOffsetX: number; centerOffsetY: number }
    ) => void;
    isFrameEditing: boolean;
  }) => (
    <>
      <button data-ui="callout-settings" onClick={props.onSettingsClick} type="button">
        settings
      </button>
      <button
        data-ui="callout-change"
        onClick={() => props.onContentChange('<p>updated</p>')}
        type="button"
      >
        update
      </button>
      <button
        data-ui="callout-tail-move"
        onClick={() => props.onTailBaseRangeChange(0.75, 0.2)}
        type="button"
      >
        move tail
      </button>
      <button
        data-ui="callout-tail-frame-move"
        onClick={() => props.onTailFramePositionChange(0.25)}
        type="button"
      >
        move tail end
      </button>
      <output data-ui="callout-frame-size">
        {props.frameRect.x},{props.frameRect.y},{props.frameRect.width}×{props.frameRect.height}
      </output>
      <output data-ui="callout-frame-editing">{String(props.isFrameEditing)}</output>
      <button
        data-ui="callout-move"
        onClick={() =>
          props.onPositionChange(
            { centerOffsetX: 70, centerOffsetY: -20 },
            {
              connectorBasePosition: 0.25,
              connectorBaseWidth: 0.2,
              connectorFramePosition: 0.75,
              connectorWaypoint: { centerOffsetX: 12, centerOffsetY: 18 },
              translateConnectorGeometry: false,
            }
          )
        }
        type="button"
      >
        move
      </button>
      <button
        data-ui="callout-resize-width"
        onClick={() => props.onWidthChange(260, { centerOffsetX: 84, centerOffsetY: -18 })}
        type="button"
      >
        resize width
      </button>
    </>
  ),
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
});

function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(node);
  });
}

function createFrame(): FrameData {
  return createFrameDataFixture('frame-1', {
    borderSettings: createBorderSettingsFixture({
      color: '#ff671d',
      id: 'preset-1',
      name: 'Preset',
      opacity: 100,
      radius: 0,
      width: 3,
    }),
    callout: createCalloutSettingsFixture({ htmlContent: '<p>initial</p>' }),
    width: 100,
  });
}

function createControlProps() {
  return {
    calloutPopoverAnchorRef: { current: null },
    isCalloutPopoverOpen: false,
    isFrameEditing: false,
  };
}

describe('interactive frame callout overlay', () => {
  it('commits the merged frame snapshot immediately when callout content changes', () => {
    const frame = createFrame();
    const onUpdate = vi.fn();
    const setTempFrame = vi.fn();

    renderNode(
      <InteractiveFrameCalloutOverlay
        {...createControlProps()}
        frame={frame}
        currentFrame={frame}
        frameZIndex={100}
        isCalloutEditing
        setIsCalloutEditing={vi.fn()}
        setTempFrame={setTempFrame}
        onUpdate={onUpdate}
      />
    );

    const button = container?.querySelector<HTMLButtonElement>('[data-ui="callout-change"]');
    expect(button).toBeInstanceOf(HTMLButtonElement);

    act(() => {
      button?.click();
    });

    const expectedFrame = {
      ...frame,
      callout: {
        ...frame.callout!,
        content: { ...frame.callout!.content, bodyHtml: '<p>updated</p>' },
      },
    };

    expect(setTempFrame).toHaveBeenCalledWith(expectedFrame);
    expect(onUpdate).toHaveBeenCalledWith(expectedFrame);
  });

  it('commits a manual callout placement without dropping connector geometry', () => {
    const frame = createFrame();
    frame.callout!.placement = {
      ...frame.callout!.placement,
      connectorBasePosition: 0.25,
      connectorBaseWidth: 0.2,
      connectorFramePosition: 0.75,
      connectorWaypoint: { centerOffsetX: 12, centerOffsetY: 18 },
    };
    const onUpdate = vi.fn();

    renderNode(
      <InteractiveFrameCalloutOverlay
        {...createControlProps()}
        frame={frame}
        currentFrame={frame}
        frameZIndex={100}
        isCalloutEditing={false}
        setIsCalloutEditing={vi.fn()}
        setTempFrame={vi.fn()}
        onUpdate={onUpdate}
      />
    );

    act(() => {
      container?.querySelector<HTMLButtonElement>('[data-ui="callout-move"]')?.click();
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        callout: expect.objectContaining({
          placement: expect.objectContaining({
            manualPlacement: { centerOffsetX: 70, centerOffsetY: -20 },
            connectorBasePosition: 0.25,
            connectorBaseWidth: 0.2,
            connectorFramePosition: 0.75,
            connectorWaypoint: { centerOffsetX: 12, centerOffsetY: 18 },
          }),
        }),
      })
    );
  });

  it('commits width and the opposite-edge placement as one merged frame update', () => {
    const frame = createFrame();
    const onUpdate = vi.fn();

    renderNode(
      <InteractiveFrameCalloutOverlay
        {...createControlProps()}
        frame={frame}
        currentFrame={frame}
        frameZIndex={100}
        isCalloutEditing={false}
        setIsCalloutEditing={vi.fn()}
        setTempFrame={vi.fn()}
        onUpdate={onUpdate}
      />
    );

    act(() => {
      container?.querySelector<HTMLButtonElement>('[data-ui="callout-resize-width"]')?.click();
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        callout: expect.objectContaining({
          placement: expect.objectContaining({
            manualPlacement: { centerOffsetX: 84, centerOffsetY: -18 },
          }),
          style: expect.objectContaining({
            typography: expect.objectContaining({ maxWidth: 260 }),
          }),
        }),
      })
    );
  });

  it('commits a manual tail-base position as one merged frame update', () => {
    const frame = createFrame();
    const onUpdate = vi.fn();

    renderNode(
      <InteractiveFrameCalloutOverlay
        {...createControlProps()}
        frame={frame}
        currentFrame={frame}
        frameZIndex={100}
        isCalloutEditing={false}
        setIsCalloutEditing={vi.fn()}
        setTempFrame={vi.fn()}
        onUpdate={onUpdate}
      />
    );

    act(() => {
      container?.querySelector<HTMLButtonElement>('[data-ui="callout-tail-move"]')?.click();
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        callout: expect.objectContaining({
          placement: expect.objectContaining({
            connectorBasePosition: 0.75,
            connectorBaseWidth: 0.2,
          }),
        }),
      })
    );
  });

  it('commits a manual frame-end position as one merged frame update', () => {
    const frame = createFrame();
    const onUpdate = vi.fn();

    renderNode(
      <InteractiveFrameCalloutOverlay
        {...createControlProps()}
        frame={frame}
        currentFrame={frame}
        frameZIndex={100}
        isCalloutEditing={false}
        setIsCalloutEditing={vi.fn()}
        setTempFrame={vi.fn()}
        onUpdate={onUpdate}
      />
    );

    act(() => {
      container?.querySelector<HTMLButtonElement>('[data-ui="callout-tail-frame-move"]')?.click();
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        callout: expect.objectContaining({
          placement: expect.objectContaining({ connectorFramePosition: 0.25 }),
        }),
      })
    );
  });

  it('connects the callout to the exact canonical outer-frame geometry', () => {
    const frame = createFrame();

    renderNode(
      <InteractiveFrameCalloutOverlay
        {...createControlProps()}
        frame={frame}
        currentFrame={frame}
        frameZIndex={100}
        isCalloutEditing={false}
        setIsCalloutEditing={vi.fn()}
        setTempFrame={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(container?.querySelector('[data-ui="callout-frame-size"]')?.textContent).toBe(
      `${frame.x},${frame.y},${frame.width}×${frame.height}`
    );
  });

  it('opens comment settings through the quick-popover transition', () => {
    const frame = createFrame();
    useFrameUIStore.getState().reset();

    renderNode(
      <InteractiveFrameCalloutOverlay
        {...createControlProps()}
        frame={frame}
        currentFrame={frame}
        frameZIndex={100}
        isCalloutEditing={false}
        setIsCalloutEditing={vi.fn()}
        setTempFrame={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    act(() => {
      container?.querySelector<HTMLButtonElement>('[data-ui="callout-settings"]')?.click();
    });

    expect(useFrameUIStore.getState().activePopover).toEqual({
      frameId: frame.id,
      kind: 'callout-settings',
    });
  });
});
