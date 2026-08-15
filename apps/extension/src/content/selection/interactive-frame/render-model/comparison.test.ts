import { describe, expect, it, vi } from 'vitest';
import type { InteractiveFrameProps } from './types';
import { areInteractiveFramePropsEqual } from './comparison';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';
import {
  cloneBorderPresetEffects,
  projectBorderPresetToAppliedSettings,
} from '@sniptale/runtime-contracts/highlighter/border-preset';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';

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

  it('treats capture-only frame visibility as a render-critical change', () => {
    const prevProps = createProps();
    const borderSettings = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
    prevProps.frame.borderSettings = borderSettings;
    const nextProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        borderSettings: {
          ...borderSettings,
          effects: {
            ...cloneBorderPresetEffects(borderSettings.effects),
            capture: { hideFrame: true },
          },
        },
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, nextProps)).toBe(false);
  });

  it('treats frame padding as a render-critical change', () => {
    const prevProps = createProps();
    const borderSettings = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
    prevProps.frame.borderSettings = borderSettings;
    const nextProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        borderSettings: {
          ...borderSettings,
          padding: { ...borderSettings.padding, top: borderSettings.padding.top + 8 },
        },
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, nextProps)).toBe(false);
  });

  it('treats linked annotation templates and focus blur as render-critical changes', () => {
    const prevProps = createProps();
    const borderSettings = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
    prevProps.frame.borderSettings = borderSettings;
    const linkedTemplateProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        borderSettings: {
          ...borderSettings,
          effects: {
            ...cloneBorderPresetEffects(borderSettings.effects),
            linkedTemplates: {
              calloutPresetId: 'callout-template',
              stepBadgePresetId: 'badge-template',
            },
          },
        },
      },
    };
    const focusBlurProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        focusSettings: { ...prevProps.frame.focusSettings!, blurAmount: 8 },
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, linkedTemplateProps)).toBe(false);
    expect(areInteractiveFramePropsEqual(prevProps, focusBlurProps)).toBe(false);
  });

  it('treats a tail-base-only change as render-critical', () => {
    const prevProps = createProps();
    prevProps.frame.callout = createDefaultCalloutSettings();
    prevProps.frame.callout.placement.connectorBasePosition = 0.25;
    prevProps.frame.callout.placement.connectorBaseWidth = 0.2;
    const nextPositionProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        callout: {
          ...prevProps.frame.callout,
          placement: { ...prevProps.frame.callout.placement, connectorBasePosition: 0.75 },
        },
      },
    };
    const nextWidthProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        callout: {
          ...prevProps.frame.callout,
          placement: { ...prevProps.frame.callout.placement, connectorBaseWidth: 0.4 },
        },
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, nextPositionProps)).toBe(false);
    expect(areInteractiveFramePropsEqual(prevProps, nextWidthProps)).toBe(false);
  });

  it('treats additional callout collection changes as render-critical', () => {
    const prevProps = createProps();
    const nextProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        additionalCallouts: [createDefaultCalloutSettings()],
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, nextProps)).toBe(false);
  });

  it('treats a tail-frame-only change as render-critical', () => {
    const prevProps = createProps();
    prevProps.frame.callout = createDefaultCalloutSettings();
    prevProps.frame.callout.placement.connectorFramePosition = 0.25;
    const nextProps: InteractiveFrameProps = {
      ...prevProps,
      frame: {
        ...prevProps.frame,
        callout: {
          ...prevProps.frame.callout,
          placement: { ...prevProps.frame.callout.placement, connectorFramePosition: 0.75 },
        },
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

  it('treats a step-badge normal offset as render-critical', () => {
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
          manualPlacement: { normalOffset: 24, position: 0.25, side: 'top' },
        },
      },
    };

    expect(areInteractiveFramePropsEqual(prevProps, nextProps)).toBe(false);
  });
});
