// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutLayoutState } from './layout';

const settings: CalloutSettings = {
  enabled: true,
  htmlContent: 'Comment',
  anchor: 'top-center',
  side: 'top',
  variant: 'bubble',
  bgColor: '#fff',
  textColor: '#111',
  tailSize: 8,
  fontFamily: 'sans',
  fontWeight: 'normal',
  fontSize: 14,
  maxWidth: 200,
};

describe('getCalloutLayoutState', () => {
  it('keeps identical editable box metrics when entering text editing', () => {
    const baseArgs = {
      dimensions: { width: 160, height: 48 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      settings,
      zIndex: 20,
    };
    const viewing = getCalloutLayoutState({ ...baseArgs, isEditing: false });
    const editing = getCalloutLayoutState({ ...baseArgs, isEditing: true });

    expect(editing.editableStyle.minHeight).toBe(viewing.editableStyle.minHeight);
  });

  it('positions a manual callout relative to the frame center', () => {
    const layout = getCalloutLayoutState({
      dimensions: { width: 100, height: 40 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings: { ...settings, manualPlacement: { centerOffsetX: 140, centerOffsetY: 0 } },
      zIndex: 20,
    });

    expect(layout.calloutPos).toEqual({ x: 350, y: 220 });
    expect(layout.dynamicTail?.side).toBe('right');
  });

  it('uses identical tail geometry before and after a zero-distance manual placement', () => {
    const dimensions = { width: 160, height: 48 };
    const frameRect = { x: 200, y: 200, width: 120, height: 80 };
    const automatic = getCalloutLayoutState({
      dimensions,
      frameRect,
      isEditing: false,
      settings,
      zIndex: 20,
    });
    const manualPlacement = {
      centerOffsetX:
        automatic.calloutPos.x + dimensions.width / 2 - (frameRect.x + frameRect.width / 2),
      centerOffsetY:
        automatic.calloutPos.y + dimensions.height / 2 - (frameRect.y + frameRect.height / 2),
    };
    const manual = getCalloutLayoutState({
      dimensions,
      frameRect,
      isEditing: false,
      settings: { ...settings, manualPlacement },
      zIndex: 20,
    });

    expect(automatic.dynamicTail).not.toBeNull();
    expect(manual.calloutPos).toEqual(automatic.calloutPos);
    expect(manual.dynamicTail?.path).toBe(automatic.dynamicTail?.path);
  });

  it('preserves corner-anchor tail geometry when manual placement starts', () => {
    const dimensions = { width: 160, height: 48 };
    const frameRect = { x: 200, y: 200, width: 120, height: 80 };
    const cornerSettings = { ...settings, anchor: 'top-left' as const };
    const automatic = getCalloutLayoutState({
      dimensions,
      frameRect,
      isEditing: false,
      settings: cornerSettings,
      zIndex: 20,
    });
    const manualPlacement = {
      centerOffsetX:
        automatic.calloutPos.x + dimensions.width / 2 - (frameRect.x + frameRect.width / 2),
      centerOffsetY:
        automatic.calloutPos.y + dimensions.height / 2 - (frameRect.y + frameRect.height / 2),
    };
    const manual = getCalloutLayoutState({
      dimensions,
      frameRect,
      isEditing: false,
      settings: { ...cornerSettings, manualPlacement },
      zIndex: 20,
    });

    expect(manual.calloutPos).toEqual(automatic.calloutPos);
    expect(manual.dynamicTail?.path).toBe(automatic.dynamicTail?.path);
    expect(manual.dynamicTail?.attachment.framePoint).toEqual({ x: 200, y: 200 });
  });

  it('lets an automatic callout scroll beyond the viewport with its frame', () => {
    const layout = getCalloutLayoutState({
      dimensions: { width: 100, height: 40 },
      frameRect: { x: 200, y: -120, width: 120, height: 80 },
      isEditing: false,
      settings: { ...settings, side: 'auto' },
      zIndex: 20,
    });

    expect(layout.resolvedSide).toBe('top');
    expect(layout.calloutPos).toEqual({ x: 210, y: -178 });
  });

  it('does not clamp a manual callout back into the viewport during scroll', () => {
    const layout = getCalloutLayoutState({
      dimensions: { width: 100, height: 40 },
      frameRect: { x: 200, y: -120, width: 120, height: 80 },
      isEditing: false,
      settings: { ...settings, manualPlacement: { centerOffsetX: 140, centerOffsetY: 0 } },
      zIndex: 20,
    });

    expect(layout.calloutPos).toEqual({ x: 350, y: -100 });
  });
});
