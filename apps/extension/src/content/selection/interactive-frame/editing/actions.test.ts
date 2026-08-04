import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { toggleInteractiveFrameEffectMode } from './actions';

beforeEach(() => {
  useFrameUIStore.getState().reset();
});

describe('toggleInteractiveFrameEffectMode', () => {
  it('closes the settings popover when its active effect button is clicked again', () => {
    const store = useFrameUIStore.getState();
    store.selectFrame('frame-1');
    store.togglePopover('frame-1', 'frame-settings');
    const setEffectMode = vi.fn();

    toggleInteractiveFrameEffectMode({
      closePopover: store.closePopover,
      effectMode: 'border',
      frameId: 'frame-1',
      mode: 'border',
      setEffectMode,
      togglePopover: store.togglePopover,
    });

    expect(useFrameUIStore.getState().activePopover).toBeNull();
    expect(setEffectMode).not.toHaveBeenCalled();
  });

  it.each(['step-badge', 'callout-settings'] as const)(
    'replaces an open %s popover with settings for the selected effect',
    (popoverKind) => {
      const store = useFrameUIStore.getState();
      store.selectFrame('frame-1');
      store.togglePopover('frame-1', popoverKind);
      const setEffectMode = vi.fn();

      toggleInteractiveFrameEffectMode({
        closePopover: store.closePopover,
        effectMode: 'border',
        frameId: 'frame-1',
        mode: 'blur',
        setEffectMode,
        togglePopover: store.togglePopover,
      });

      expect(useFrameUIStore.getState().activePopover).toEqual({
        frameId: 'frame-1',
        kind: 'frame-settings',
      });
      expect(setEffectMode).toHaveBeenCalledWith('blur');
    }
  );

  it('keeps frame settings open when switching between effects', () => {
    const store = useFrameUIStore.getState();
    store.selectFrame('frame-1');
    store.togglePopover('frame-1', 'frame-settings');

    toggleInteractiveFrameEffectMode({
      closePopover: store.closePopover,
      effectMode: 'border',
      frameId: 'frame-1',
      mode: 'focus',
      setEffectMode: vi.fn(),
      togglePopover: store.togglePopover,
    });

    expect(useFrameUIStore.getState().activePopover).toEqual({
      frameId: 'frame-1',
      kind: 'frame-settings',
    });
  });
});
