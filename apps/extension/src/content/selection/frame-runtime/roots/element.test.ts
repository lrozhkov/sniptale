import { describe, expect, it, vi } from 'vitest';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { createInteractiveFrameElement } from './element';

function createFrame(id: string): FrameData {
  return {
    borderSettings: {
      color: '#000000',
      customCss: '',
      fillColor: '#00000000',
      fillOpacity: 0,
      inheritCustomCss: false,
      strokeOpacity: 100,
      id: 'border',
      isSystemDefault: true,
      name: 'Default Border',
      opacity: 1,
      order: 0,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      radius: 6,
      shadow: 0,
      style: 'solid',
      width: 2,
    },
    effectMode: 'border',
    height: 80,
    id,
    width: 120,
    x: 10,
    y: 20,
  };
}

describe('frame-roots-renderer-element', () => {
  it('wires interactive frame callbacks through action refs', () => {
    const removeFrame = vi.fn();
    const updateFrame = vi.fn();
    const updateFrameEffect = vi.fn();
    const updateFrameState = vi.fn();
    const frame = createFrame('frame-1');
    const updatedFrame = { ...frame, x: 42 };
    const InteractiveFrameComponent = vi.fn(() => null);

    const element = createInteractiveFrameElement({
      actionRefs: {
        removeFrameRef: { current: removeFrame },
        updateFrameEffectRef: { current: updateFrameEffect },
        updateFrameRef: { current: updateFrame },
        updateFrameStateRef: { current: updateFrameState },
      },
      frameData: frame,
      globalEffectModeRef: { current: 'focus' as EffectMode },
      InteractiveFrameComponent,
      zIndex: 7,
    });

    expect(element.type).toBe(InteractiveFrameComponent);
    expect(element.props.defaultEffectMode).toBe('focus');
    expect(element.props.frame).toBe(frame);
    expect(element.props.zIndex).toBe(7);

    element.props.onStateChange?.('editing' as FrameState);
    element.props.onUpdate(updatedFrame);
    element.props.onDelete();
    element.props.onEffectChange?.('frame-1', 'blur' as EffectMode);

    expect(updateFrameState).toHaveBeenCalledWith('frame-1', 'editing');
    expect(updateFrame).toHaveBeenCalledWith('frame-1', updatedFrame);
    expect(removeFrame).toHaveBeenCalledWith('frame-1');
    expect(updateFrameEffect).toHaveBeenCalledWith('frame-1', 'blur');
  });
});
