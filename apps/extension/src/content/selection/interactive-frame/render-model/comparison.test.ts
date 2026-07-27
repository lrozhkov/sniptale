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
  it('preserves fractional canonical rect updates', () => {
    const prevProps = createProps();
    const nextProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        x: prevProps.frame.x + 0.125,
        width: prevProps.frame.width + 0.25,
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, nextProps)).toBe(false);
  });

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

  it('treats a tail-base-only change as render-critical', () => {
    const prevProps = createProps();
    prevProps.frame.callout = {
      anchor: 'center',
      bgColor: '#fff',
      enabled: true,
      fontFamily: 'sans',
      fontSize: 14,
      fontWeight: 'normal',
      htmlContent: 'Comment',
      maxWidth: 200,
      side: 'top',
      tailBasePosition: 0.25,
      tailBaseWidth: 0.2,
      tailSize: 8,
      textColor: '#111',
      variant: 'bubble',
    };
    const nextPositionProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        callout: { ...prevProps.frame.callout, tailBasePosition: 0.75 },
      },
    };
    const nextWidthProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        callout: { ...prevProps.frame.callout, tailBaseWidth: 0.4 },
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, nextPositionProps)).toBe(false);
    expect(areInteractiveFramePropsEqual(prevProps, nextWidthProps)).toBe(false);
  });

  it('treats a tail-frame-only change as render-critical', () => {
    const prevProps = createProps();
    prevProps.frame.callout = {
      anchor: 'center',
      bgColor: '#fff',
      enabled: true,
      fontFamily: 'sans',
      fontSize: 14,
      fontWeight: 'normal',
      htmlContent: 'Comment',
      maxWidth: 200,
      side: 'top',
      tailFramePosition: 0.25,
      tailSize: 8,
      textColor: '#111',
      variant: 'bubble',
    };
    const nextProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        callout: { ...prevProps.frame.callout, tailFramePosition: 0.75 },
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, nextProps)).toBe(false);
  });

  it('treats a manual step-badge boundary move as render-critical', () => {
    const prevProps = createProps();
    prevProps.frame.stepBadge = {
      enabled: true,
      manualPlacement: { position: 0.25, side: 'top' },
      type: 'number',
      value: '1',
    };
    const nextProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        stepBadge: {
          ...prevProps.frame.stepBadge,
          manualPlacement: { position: 0.75, side: 'bottom' },
        },
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, nextProps)).toBe(false);
  });
});
