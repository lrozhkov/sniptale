// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from '../../frame-runtime/test-support';
import { addFrameStepBadgeChangedListener } from '../../../platform/page-context/frame-events';

vi.mock('../../step-badge', () => ({
  StepBadge: (props: {
    onPositionChange: (placement: { position: number; side: 'bottom' }) => void;
    onSettingsClick: () => void;
  }) => (
    <>
      <button
        type="button"
        data-ui="move-step"
        onClick={() => props.onPositionChange({ position: 0.7, side: 'bottom' })}
      />
      <button type="button" data-ui="step-settings" onClick={props.onSettingsClick} />
    </>
  ),
}));

vi.mock('./handles', () => ({ InteractiveFrameResizeHandles: () => null }));

import { InteractiveFrameFrameShell } from './shell';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  useFrameUIStore.getState().reset();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('InteractiveFrameFrameShell step badge controls', () => {
  it('commits a boundary move through the step-badge owner and opens quick settings', () => {
    const frame = createFrameDataFixture('frame-1', {
      stepBadge: createStepBadgeSettingsFixture({ value: '3' }),
    });
    const stepBadgeListener = vi.fn();
    const cleanupStepBadgeListener = addFrameStepBadgeChangedListener(stepBadgeListener);

    act(() => {
      root.render(
        <InteractiveFrameFrameShell
          borderColor="#111"
          borderWidth={3}
          containerRef={{ current: null }}
          currentFrame={frame}
          frame={frame}
          frameRef={{ current: null }}
          frameStyle={{}}
          fillStyle={{ backgroundColor: 'rgba(22, 163, 74, 0.25)', borderRadius: '8px' }}
          strokeStyle={{ border: '3px solid rgb(17, 17, 17)', borderRadius: '8px' }}
          frameZIndex={100}
          handleMouseDown={vi.fn()}
          handleResizeStart={vi.fn()}
          isResizeHovered={false}
          isStepBadgePopoverOpen={false}
          state="idle"
          stepBadgePopoverAnchorRef={{ current: null }}
          tempFrame={frame}
        />
      );
    });

    const container = host.querySelector<HTMLElement>('.sniptale-frame-container');
    const surface = host.querySelector<HTMLElement>('.sniptale-interactive-frame');
    const fill = host.querySelector<HTMLElement>('.sniptale-interactive-frame-fill');
    const stroke = host.querySelector<HTMLElement>('.sniptale-interactive-frame-stroke');
    expect(container?.style.left).toBe(`${frame.x}px`);
    expect(container?.style.top).toBe(`${frame.y}px`);
    expect(container?.style.width).toBe(`${frame.width}px`);
    expect(container?.style.height).toBe(`${frame.height}px`);
    expect(fill?.parentElement).toBe(surface);
    expect(stroke?.parentElement).toBe(surface);
    expect(Array.from(surface?.children ?? []).slice(0, 2)).toEqual([fill, stroke]);
    expect(fill?.style.backgroundColor).toBe('rgba(22, 163, 74, 0.25)');
    expect(fill?.style.borderRadius).toBe('8px');
    expect(stroke?.style.border).toBe('3px solid rgb(17, 17, 17)');
    expect(stroke?.style.borderRadius).toBe('8px');

    act(() => host.querySelector<HTMLButtonElement>('[data-ui="move-step"]')?.click());
    expect(stepBadgeListener).toHaveBeenCalledOnce();
    expect(stepBadgeListener).toHaveBeenCalledWith({
      frameId: frame.id,
      settings: { manualPlacement: { position: 0.7, side: 'bottom' } },
    });

    act(() => host.querySelector<HTMLButtonElement>('[data-ui="step-settings"]')?.click());
    expect(useFrameUIStore.getState().activePopover).toEqual({
      frameId: frame.id,
      kind: 'step-badge',
    });
    cleanupStepBadgeListener();
  });
});
