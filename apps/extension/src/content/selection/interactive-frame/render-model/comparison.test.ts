import { describe, expect, it, vi } from 'vitest';
import type { InteractiveFrameProps } from './types';
import { areInteractiveFramePropsEqual } from './comparison';

function createProps(): InteractiveFrameProps {
  return {
    defaultEffectMode: 'focus',
    frame: {
      effectMode: 'focus',
      focusSettings: { opacity: 0.5, showBorder: false },
      height: 80,
      id: 'frame-1',
      width: 120,
      x: 10,
      y: 20,
    },
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    zIndex: 1,
  };
}

describe('areInteractiveFramePropsEqual', () => {
  it('treats focus border visibility as a render-critical change', () => {
    const prevProps = createProps();
    const nextProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        focusSettings: { opacity: 0.5, showBorder: true },
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, nextProps)).toBe(false);
  });
});
