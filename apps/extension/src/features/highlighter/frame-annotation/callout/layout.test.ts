// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutLayoutState } from './layout';
import { FRAME_ANNOTATION_Z_INDEX } from '../interaction/z-index';
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
    expect(editing.effectiveZIndex).toBeGreaterThan(FRAME_ANNOTATION_Z_INDEX.stepBadge);
    expect(editing.cloudStyle.boxSizing).toBe('border-box');
    expect(editing.cloudStyle.width).toBe('max-content');
    expect(editing.cloudStyle.maxWidth).toBe(settings.style.typography.maxWidth);
    expect(editing.editableStyle.minWidth).toBe('1ch');
  });

  it('caps a viewing callout at the annotation-content layer', () => {
    const layout = getCalloutLayoutState({
      dimensions: { width: 160, height: 48 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings,
      zIndex: FRAME_ANNOTATION_Z_INDEX.stepBadge,
    });

    expect(layout.effectiveZIndex).toBeLessThanOrEqual(FRAME_ANNOTATION_Z_INDEX.stepBadge);
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

  it.each([
    { visualScale: 0.2, expectedX: 278 },
    { visualScale: 4, expectedX: 620 },
  ])(
    'keeps a manual offset in physical pixels at visual scale $visualScale',
    ({ expectedX, visualScale }) => {
      const layout = getCalloutLayoutState({
        dimensions: { width: 100 * visualScale, height: 40 * visualScale },
        frameRect: { x: 200, y: 200, width: 120, height: 80 },
        isEditing: false,
        settings: {
          ...settings,
          placement: {
            ...settings.placement,
            manualPlacement: { centerOffsetX: 140, centerOffsetY: 0 },
          },
        },
        visualScale,
        zIndex: 20,
      });

      expect(layout.calloutPos.x).toBeCloseTo(expectedX);
      expect(
        (layout.calloutPos.x + layout.calloutDimensions.width / 2 - 260) / visualScale
      ).toBeCloseTo(140);
    }
  );

  it('scales automatic spacing and wedge geometry in the page coordinate space', () => {
    const baseline = getCalloutLayoutState({
      dimensions: { width: 100, height: 40 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings,
      zIndex: 20,
    });
    const zoomed = getCalloutLayoutState({
      dimensions: { width: 20, height: 8 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings,
      visualScale: 0.2,
      zIndex: 20,
    });

    expect((200 - (zoomed.calloutPos.y + 8)) / 0.2).toBeCloseTo(200 - (baseline.calloutPos.y + 40));
    expect(baseline.dynamicTail?.kind).toBe('wedge');
    expect(zoomed.dynamicTail?.kind).toBe('wedge');
    if (baseline.dynamicTail?.kind === 'wedge' && zoomed.dynamicTail?.kind === 'wedge') {
      expect(Math.abs(baseline.dynamicTail.attachment.tipPoint.y - 200)).toBeCloseTo(8);
      expect(Math.abs(zoomed.dynamicTail.attachment.tipPoint.y - 200) / 0.2).toBeCloseTo(8);
    }
  });
});

describe('getCalloutLayoutState connector geometry', () => {
  it.each(['wedge', 'line'] as const)(
    'lands a %s connector on the center line of an outward frame stroke',
    (kind) => {
      const layout = getCalloutLayoutState({
        dimensions: { width: 160, height: 48 },
        frameBorderWidth: 4,
        frameRect: { x: 200, y: 200, width: 120, height: 80 },
        isEditing: false,
        settings: {
          ...settings,
          style: {
            ...settings.style,
            connector: { ...settings.style.connector, kind, routing: 'straight' },
          },
        },
        zIndex: 20,
      });

      expect(layout.dynamicTail?.attachment.framePoint.y).toBe(198);
    }
  );

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
