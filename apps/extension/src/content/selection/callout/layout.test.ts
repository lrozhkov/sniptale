// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutLayoutState } from './layout';
import { Z_INDEX_STEP_BADGE } from '../interactive-frame/layout/portal';
import { createDefaultCalloutSettings } from './model';

const settings: CalloutSettings = createDefaultCalloutSettings();
settings.content.bodyHtml = 'Comment';
settings.placement.side = 'top';

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
    expect(editing.effectiveZIndex).toBeLessThan(Z_INDEX_STEP_BADGE);
    expect(editing.cloudStyle.width).toBe('max-content');
    expect(editing.cloudStyle.maxWidth).toBe(settings.style.typography.maxWidth);
  });

  it('caps a viewing callout below the global step-badge layer', () => {
    const layout = getCalloutLayoutState({
      dimensions: { width: 160, height: 48 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings,
      zIndex: Z_INDEX_STEP_BADGE,
    });

    expect(layout.effectiveZIndex).toBeLessThan(Z_INDEX_STEP_BADGE);
  });

  it('uses the configured shadow color in the rendered filter', () => {
    const layout = getCalloutLayoutState({
      dimensions: { width: 160, height: 48 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings: {
        ...settings,
        style: {
          ...settings.style,
          surface: { ...settings.style.surface, shadow: 12, shadowColor: '#ff0000' },
        },
      },
      zIndex: 20,
    });

    expect(layout.wrapperStyle.filter).toContain('#ff0000');
  });

  it('applies preset emphasis and alignment styles to the whole comment', () => {
    const layout = getCalloutLayoutState({
      dimensions: { width: 160, height: 48 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings: {
        ...settings,
        style: {
          ...settings.style,
          typography: {
            ...settings.style.typography,
            fontStyle: 'italic',
            textAlign: 'center',
            textDecoration: 'underline',
          },
        },
      },
      zIndex: 20,
    });

    expect(layout.cloudStyle.fontStyle).toBe('italic');
    expect(layout.cloudStyle.textAlign).toBe('center');
    expect(layout.cloudStyle.textDecoration).toBe('underline');
  });

  it('leaves the HTML cloud transparent for the flush combined bubble and wedge contour', () => {
    const layout = getCalloutLayoutState({
      dimensions: { width: 160, height: 48 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings: {
        ...settings,
        style: {
          ...settings.style,
          surface: { ...settings.style.surface, borderColor: '#ff7a00', borderWidth: 4 },
        },
      },
      zIndex: 20,
    });

    if (layout.dynamicTail?.kind !== 'wedge') {
      throw new Error('Expected a wedge connector');
    }
    expect(layout.cloudStyle.border).toBe('4px solid transparent');
    expect(layout.cloudStyle.backgroundColor).toBe('transparent');
    expect(layout.cloudStyle.backgroundClip).toBeUndefined();
    expect(layout.dynamicTail.outlinePath).toContain('Z');
  });

  it('positions a manual callout relative to the frame center', () => {
    const layout = getCalloutLayoutState({
      dimensions: { width: 100, height: 40 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings: {
        ...settings,
        placement: {
          ...settings.placement,
          manualPlacement: { centerOffsetX: 140, centerOffsetY: 0 },
        },
      },
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
      settings: { ...settings, placement: { ...settings.placement, manualPlacement } },
      zIndex: 20,
    });

    expect(automatic.dynamicTail).not.toBeNull();
    expect(manual.calloutPos).toEqual(automatic.calloutPos);
    expect(manual.dynamicTail?.path).toBe(automatic.dynamicTail?.path);
  });

  it('preserves corner-anchor tail geometry when manual placement starts', () => {
    const dimensions = { width: 160, height: 48 };
    const frameRect = { x: 200, y: 200, width: 120, height: 80 };
    const cornerSettings = {
      ...settings,
      placement: { ...settings.placement, anchor: 'top-left' as const },
    };
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
      settings: {
        ...cornerSettings,
        placement: { ...cornerSettings.placement, manualPlacement },
      },
      zIndex: 20,
    });

    expect(manual.calloutPos).toEqual(automatic.calloutPos);
    expect(manual.dynamicTail?.path).toBe(automatic.dynamicTail?.path);
    expect(manual.dynamicTail?.attachment.framePoint).toEqual({ x: 200, y: 200 });
  });

  it('shifts automatic corner callouts outward for an approximately diagonal connector', () => {
    const dimensions = { width: 160, height: 48 };
    const frameRect = { x: 200, y: 200, width: 120, height: 80 };
    const cornerSettings: CalloutSettings = {
      ...settings,
      placement: { ...settings.placement, anchor: 'top-left', side: 'top' },
      style: {
        ...settings.style,
        connector: { ...settings.style.connector, kind: 'line', routing: 'straight' },
      },
    };
    const corner = getCalloutLayoutState({
      dimensions,
      frameRect,
      isEditing: false,
      settings: cornerSettings,
      zIndex: 20,
    });
    const centered = getCalloutLayoutState({
      dimensions,
      frameRect,
      isEditing: false,
      settings: {
        ...cornerSettings,
        placement: { ...cornerSettings.placement, anchor: 'top-center' },
      },
      zIndex: 20,
    });

    expect(corner.calloutPos.x).toBeLessThan(frameRect.x - dimensions.width / 2);
    expect(centered.calloutPos.x).toBe(frameRect.x + frameRect.width / 2 - dimensions.width / 2);
    if (corner.dynamicTail?.kind !== 'line') throw new Error('Expected a line connector');
    const blockPoint = corner.dynamicTail.routePoints[0]!;
    const framePoint = corner.dynamicTail.routePoints.at(-1)!;
    expect(
      Math.abs(Math.abs(framePoint.x - blockPoint.x) - Math.abs(framePoint.y - blockPoint.y))
    ).toBeLessThan(1);
  });

  it('lets an automatic callout scroll beyond the viewport with its frame', () => {
    const layout = getCalloutLayoutState({
      dimensions: { width: 100, height: 40 },
      frameRect: { x: 200, y: -120, width: 120, height: 80 },
      isEditing: false,
      settings: { ...settings, placement: { ...settings.placement, side: 'auto' } },
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
      settings: {
        ...settings,
        placement: {
          ...settings.placement,
          manualPlacement: { centerOffsetX: 140, centerOffsetY: 0 },
        },
      },
      zIndex: 20,
    });

    expect(layout.calloutPos).toEqual({ x: 350, y: -100 });
  });
});
