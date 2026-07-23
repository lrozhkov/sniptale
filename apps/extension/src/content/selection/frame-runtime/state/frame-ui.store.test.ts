import { beforeEach, describe, expect, it } from 'vitest';
import { useFrameUIStore } from './frame-ui.store';

beforeEach(() => {
  useFrameUIStore.getState().reset();
});

describe('frame UI store visibility hierarchy', () => {
  it('keeps an open popover attached to its active tooltip until the popover closes', () => {
    const store = useFrameUIStore.getState();

    store.showTooltip('frame-a');
    store.openPopover('frame-a');
    store.hideTooltip('frame-a');

    expect(useFrameUIStore.getState()).toMatchObject({
      activeFrameId: 'frame-a',
      popoverFrameId: 'frame-a',
    });

    store.closePopover();
    store.hideTooltip('frame-a');

    expect(useFrameUIStore.getState()).toMatchObject({
      activeFrameId: null,
      popoverFrameId: null,
    });
  });

  it('moves tooltip authority with a directly opened popover and blocks another frame', () => {
    const store = useFrameUIStore.getState();

    store.openPopover('frame-a');
    store.showTooltip('frame-b');

    expect(useFrameUIStore.getState()).toMatchObject({
      activeFrameId: 'frame-a',
      popoverFrameId: 'frame-a',
    });
  });
});

describe('frame UI store cleanup', () => {
  it('clears tooltip and popover authority through force-hide and reset', () => {
    const store = useFrameUIStore.getState();

    store.openPopover('frame-a');
    store.forceHideTooltip();
    expect(useFrameUIStore.getState()).toMatchObject({
      activeFrameId: null,
      popoverFrameId: null,
    });

    store.openPopover('frame-b');
    store.reset();
    expect(useFrameUIStore.getState()).toMatchObject({
      activeFrameId: null,
      popoverFrameId: null,
    });
  });
});
