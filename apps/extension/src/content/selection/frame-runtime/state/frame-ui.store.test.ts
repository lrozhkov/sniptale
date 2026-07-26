import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFrameUIStore } from './frame-ui.store';

beforeEach(() => {
  useFrameUIStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('frame UI store visibility hierarchy', () => {
  it('keeps hover and selected ownership independent', () => {
    const store = useFrameUIStore.getState();

    store.hoverFrame('frame-a');
    store.selectFrame('frame-a', { x: 140, y: 90 });
    store.hoverFrame('frame-b');

    expect(useFrameUIStore.getState()).toMatchObject({
      hoveredFrameId: 'frame-b',
      selectedFrameId: 'frame-a',
      toolbarAnchorOffset: { x: 140, y: 90 },
    });
  });

  it('keeps an open popover attached to its selected frame until the selection closes', () => {
    const store = useFrameUIStore.getState();

    store.selectFrame('frame-a');
    store.setResizeFrame('frame-a');
    store.togglePopover('frame-a', 'frame-settings');

    expect(useFrameUIStore.getState()).toMatchObject({
      selectedFrameId: 'frame-a',
      activePopover: { frameId: 'frame-a', kind: 'frame-settings' },
      resizeFrameId: null,
    });

    store.closePopover();
    store.clearSelection();

    expect(useFrameUIStore.getState()).toMatchObject({
      selectedFrameId: null,
      activePopover: null,
    });
  });

  it('keeps quick popovers independent from selection authority', () => {
    const store = useFrameUIStore.getState();

    store.setResizeFrame('frame-a');
    store.toggleQuickPopover('frame-a', 'step-badge');

    expect(useFrameUIStore.getState()).toMatchObject({
      selectedFrameId: null,
      activePopover: { frameId: 'frame-a', kind: 'step-badge' },
      resizeFrameId: null,
    });
  });

  it('closes a quick popover when the main toolbar selects a frame', () => {
    const store = useFrameUIStore.getState();

    store.toggleQuickPopover('frame-a', 'callout-settings');
    store.selectFrame('frame-a', { x: 30, y: 12 });

    expect(useFrameUIStore.getState()).toMatchObject({
      selectedFrameId: 'frame-a',
      toolbarAnchorOffset: { x: 30, y: 12 },
      activePopover: null,
    });
  });

  it('switches popover families atomically for one selected frame', () => {
    const store = useFrameUIStore.getState();
    store.selectFrame('frame-a');
    store.toggleQuickPopover('frame-a', 'step-badge');
    store.togglePopover('frame-a', 'callout-settings');

    expect(useFrameUIStore.getState()).toMatchObject({
      selectedFrameId: 'frame-a',
      activePopover: { frameId: 'frame-a', kind: 'callout-settings' },
    });
  });

  it('delays hover dismissal and cancels it when the pointer reaches the trigger', () => {
    vi.useFakeTimers();
    const store = useFrameUIStore.getState();

    store.hoverFrame('frame-a');
    store.scheduleHoverFrameHide('frame-a');
    store.hoverFrame('frame-a');

    expect(useFrameUIStore.getState().hoveredFrameId).toBe('frame-a');
  });

  it('keeps the hover winner for the full bridge grace period', () => {
    vi.useFakeTimers();
    const store = useFrameUIStore.getState();

    store.hoverFrame('frame-a');
    store.scheduleHoverFrameHide('frame-a');
    vi.advanceTimersByTime(249);
    expect(useFrameUIStore.getState().hoveredFrameId).toBe('frame-a');

    vi.advanceTimersByTime(1);
    expect(useFrameUIStore.getState().hoveredFrameId).toBeNull();
  });
});

describe('frame UI store cleanup', () => {
  it('drops only references owned by a removed frame', () => {
    const store = useFrameUIStore.getState();
    store.selectFrame('selected', { x: 20, y: 30 });
    store.hoverFrame('removed');
    store.setResizeFrame('removed');

    store.dismissFrame('removed');

    expect(useFrameUIStore.getState()).toMatchObject({
      hoveredFrameId: null,
      resizeFrameId: null,
      selectedFrameId: 'selected',
      toolbarAnchorOffset: { x: 20, y: 30 },
    });
  });

  it('does not cancel another frame hover dismissal when an unrelated frame is removed', () => {
    vi.useFakeTimers();
    const store = useFrameUIStore.getState();
    store.hoverFrame('frame-a');
    store.scheduleHoverFrameHide('frame-a');

    store.dismissFrame('frame-b');
    vi.advanceTimersByTime(250);

    expect(useFrameUIStore.getState().hoveredFrameId).toBeNull();
  });

  it('clears hover, selection and popover authority through dismiss and reset', () => {
    const store = useFrameUIStore.getState();

    store.togglePopover('frame-a', 'frame-settings');
    store.dismissFrameUi();
    expect(useFrameUIStore.getState()).toMatchObject({
      hoveredFrameId: null,
      selectedFrameId: null,
      activePopover: null,
    });

    store.toggleQuickPopover('frame-b', 'callout-settings');
    store.reset();
    expect(useFrameUIStore.getState()).toMatchObject({
      hoveredFrameId: null,
      selectedFrameId: null,
      activePopover: null,
    });
  });
});
