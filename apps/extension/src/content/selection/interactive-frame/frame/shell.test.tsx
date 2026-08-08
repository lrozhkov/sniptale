// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from '../../frame-runtime/test-support';
import { addFrameStepBadgeChangedListener } from '../../../platform/page-context/frame-events';
import {
  initializeContentUiRoots,
  isContentOwnedPassiveChrome,
  PASSIVE_CONTENT_CHROME,
} from '../../../platform/dom-host';

vi.mock('../../step-badge', () => ({
  StepBadge: (props: {
    onPositionChange: (placement: { position: number; side: 'bottom' }) => void;
    onSettingsClick: () => void;
  }) => (
    <div data-ui="step-badge">
      <button
        type="button"
        data-ui="move-step"
        onClick={() => props.onPositionChange({ position: 0.7, side: 'bottom' })}
      />
      <button type="button" data-ui="step-settings" onClick={props.onSettingsClick} />
    </div>
  ),
}));

const resizeHandleOwner = vi.hoisted(() => ({ props: null as unknown }));

vi.mock('./handles', () => ({
  InteractiveFrameResizeHandles: (props: unknown) => {
    resizeHandleOwner.props = props;
    return null;
  },
}));

import { InteractiveFrameFrameShell } from './shell';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const contentHost = document.createElement('div');
  document.body.append(contentHost);
  const shadowRoot = contentHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(shadowRoot);
  host = document.createElement('div');
  shadowRoot.append(host);
  root = createRoot(host);
  useFrameUIStore.getState().reset();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
  resizeHandleOwner.props = null;
});

describe('InteractiveFrameFrameShell step badge controls', () => {
  it('anchors idle resize handles to current frame geometry instead of a stale draft', () => {
    const currentFrame = createFrameDataFixture('frame-current', {
      x: 140,
      y: 90,
      width: 320,
      height: 180,
    });
    const staleDraft = { ...currentFrame, x: 20, y: 15, width: 120, height: 80 };

    act(() => {
      root.render(
        <InteractiveFrameFrameShell
          borderColor="#111"
          borderWidth={3}
          containerRef={{ current: null }}
          currentFrame={currentFrame}
          frame={currentFrame}
          frameRef={{ current: null }}
          frameStyle={{}}
          fillStyle={{}}
          strokeStyle={{}}
          frameZIndex={100}
          handleMouseDown={vi.fn()}
          handleResizeStart={vi.fn()}
          isResizeHovered
          isStepBadgePopoverOpen={false}
          state="idle"
          stepBadgePopoverAnchorRef={{ current: null }}
          tempFrame={staleDraft}
        />
      );
    });

    expect((resizeHandleOwner.props as { tempFrame: typeof currentFrame }).tempFrame).toBe(
      currentFrame
    );
  });

  it('keeps the badge surface and settings anchor mounted for an empty value', () => {
    const frame = createFrameDataFixture('frame-empty', {
      stepBadge: createStepBadgeSettingsFixture({ auto: false, value: '' }),
    });

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
          fillStyle={{}}
          strokeStyle={{}}
          frameZIndex={100}
          handleMouseDown={vi.fn()}
          handleResizeStart={vi.fn()}
          isResizeHovered={false}
          isStepBadgePopoverOpen
          state="idle"
          stepBadgePopoverAnchorRef={{ current: null }}
          tempFrame={frame}
        />
      );
    });

    expect(host.querySelector('[data-ui="step-badge"]')).not.toBeNull();
  });

  it('commits a boundary move through the step-badge owner and opens quick settings', () => {
    const frame = createFrameDataFixture('frame-1', {
      borderSettings: {
        ...createFrameDataFixture('defaults').borderSettings!,
        effects: {
          blur: { amount: 10, blurType: 'gaussian' },
          focus: { blurAmount: 0, opacity: 0.5 },
          capture: { hideFrame: true },
        },
      },
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
    expect(fill?.dataset['hideDuringCapture']).toBe('true');
    expect(stroke?.dataset['hideDuringCapture']).toBe('true');
    for (const [name, value] of Object.entries(PASSIVE_CONTENT_CHROME)) {
      expect(container?.getAttribute(name)).toBe(value);
      expect(surface?.getAttribute(name)).toBe(value);
      expect(fill?.getAttribute(name)).toBe(value);
      expect(stroke?.getAttribute(name)).toBe(value);
      expect(host.querySelector('[data-ui="move-step"]')?.getAttribute(name)).toBeNull();
      expect(host.querySelector('[data-ui="step-settings"]')?.getAttribute(name)).toBeNull();
    }
    expect([container, surface, fill, stroke].every(isContentOwnedPassiveChrome)).toBe(true);
    expect(
      [
        host.querySelector('[data-ui="move-step"]'),
        host.querySelector('[data-ui="step-settings"]'),
      ].some(isContentOwnedPassiveChrome)
    ).toBe(false);

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
