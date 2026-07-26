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
