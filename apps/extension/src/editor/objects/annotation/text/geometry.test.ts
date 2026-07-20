import { describe, expect, it } from 'vitest';

import {
  getTextCalloutBodyRect,
  getTextCalloutContentRect,
  getMinimumTextCalloutSurfaceSize,
  getScaledTextCalloutSurfaceSize,
  getTextCalloutContentSize,
  getTextCalloutFrame,
  getTextCalloutSurfaceSize,
  getTextCalloutTailMetrics,
  normalizeCalloutDimension,
} from './geometry';

function createTextbox(overrides: Record<string, unknown> = {}) {
  return {
    fontSize: 16,
    height: 40,
    sniptaleTextCalloutHeight: 60,
    sniptaleTextCalloutWidth: 140,
    padding: 10,
    scaleX: 1,
    scaleY: 1,
    width: 120,
    ...overrides,
  };
}

function registerSurfaceClampingTests() {
  it('normalizes stored dimensions and clamps non-plain surfaces to their minimum outer bounds', () => {
    const textbox = createTextbox();

    expect(normalizeCalloutDimension(18.4)).toBe(18);
    expect(normalizeCalloutDimension('18')).toBeNull();
    expect(getMinimumTextCalloutSurfaceSize(textbox as never, 'bubble')).toEqual({
      height: 76,
      width: 156,
    });
    expect(getTextCalloutSurfaceSize(textbox as never, 'bubble')).toEqual({
      height: 76,
      width: 156,
    });
  });
}

function registerPlainLayoutTests() {
  it('keeps auto plain text geometry tied to the textbox layout box', () => {
    const textbox = createTextbox({
      sniptaleTextCalloutHeight: 400,
      sniptaleTextCalloutWidth: 400,
      sniptaleTextLayoutMode: 'auto',
      padding: 0,
    });

    expect(getTextCalloutSurfaceSize(textbox as never, 'plain')).toEqual({
      height: 40,
      width: 120,
    });
    expect(
      getTextCalloutContentSize({ height: 40, width: 120 }, textbox as never, 'plain')
    ).toEqual({
      height: 40,
      width: 120,
    });
  });

  it('uses stored fixed-width plain text height as the editable box height', () => {
    const textbox = createTextbox({
      height: 40,
      sniptaleTextCalloutHeight: 120,
      sniptaleTextCalloutWidth: 240,
      sniptaleTextLayoutMode: 'fixed-width',
      sniptaleTextVerticalAlign: 'center',
      padding: 0,
      width: 120,
    });

    expect(getTextCalloutSurfaceSize(textbox as never, 'plain')).toEqual({
      height: 120,
      width: 240,
    });
    expect(
      getTextCalloutContentRect({ height: 120, width: 240 }, textbox as never, 'plain')
    ).toEqual({
      height: 120,
      left: 0,
      top: 40,
      width: 240,
    });
  });
}

function registerSharedSurfaceMathTests() {
  it('derives content, frame, and scaled surface sizes from the authoritative width-first surface', () => {
    const textbox = createTextbox({
      sniptaleTextCalloutHeight: 120,
      sniptaleTextCalloutWidth: 420,
      scaleX: 1.5,
      scaleY: 0.5,
    });
    const surface = getTextCalloutSurfaceSize(textbox as never, 'bubble');

    expect(surface).toEqual({ height: 120, width: 420 });
    expect(getTextCalloutContentSize(surface, textbox as never, 'bubble')).toEqual({
      height: 74,
      width: 384,
    });
    expect(getTextCalloutFrame(surface)).toEqual({
      height: 104,
      left: -202,
      top: -52,
      width: 404,
    });
    expect(getScaledTextCalloutSurfaceSize(textbox as never, 'bubble')).toEqual({
      height: 60,
      width: 630,
    });
  });
}

function registerBodyRectTests() {
  it('excludes the pointer tail from the body and content rects for asymmetric callouts', () => {
    const textbox = createTextbox({
      height: 48,
      sniptaleTextCalloutHeight: 120,
      sniptaleTextCalloutWidth: 240,
      padding: 10,
      width: 140,
    });
    const surface = getTextCalloutSurfaceSize(textbox as never, 'pointer');

    expect(surface).toEqual({ height: 120, width: 240 });
    expect(getTextCalloutBodyRect(surface, 'pointer')).toEqual({
      height: 104,
      left: 44,
      top: 8,
      width: 188,
    });
    expect(getTextCalloutContentSize(surface, textbox as never, 'pointer')).toEqual({
      height: 84,
      width: 168,
    });
  });
}

function registerVerticalAlignTests() {
  it('positions fixed-width callout text inside the body rect for vertical alignment modes', () => {
    const textbox = createTextbox({
      height: 48,
      sniptaleTextCalloutHeight: 120,
      sniptaleTextCalloutWidth: 240,
      sniptaleTextLayoutMode: 'fixed-width',
      sniptaleTextVerticalAlign: 'bottom',
      padding: 10,
      width: 140,
    });
    const surface = getTextCalloutSurfaceSize(textbox as never, 'pointer');

    expect(getTextCalloutContentRect(surface, textbox as never, 'pointer')).toEqual({
      height: 84,
      left: 54,
      top: 54,
      width: 168,
    });
    expect(getTextCalloutTailMetrics(surface, 'flag')).toEqual({ notchWidth: 24 });
    expect(getTextCalloutTailMetrics(surface, 'arrow-bubble')).toEqual({
      halfWidth: 12,
      height: 12,
      shoulderOffset: 4,
    });
  });

  it('keeps auto-layout text pinned to the top even with stored vertical alignment', () => {
    const textbox = createTextbox({
      height: 40,
      sniptaleTextLayoutMode: 'auto',
      sniptaleTextVerticalAlign: 'bottom',
      padding: 0,
      width: 120,
    });

    expect(
      getTextCalloutContentRect({ height: 120, width: 240 }, textbox as never, 'plain')
    ).toEqual({
      height: 120,
      left: 0,
      top: 0,
      width: 240,
    });
  });
}

function registerFallbackTests() {
  it('falls back to the default fixed-size callout surface when no explicit dimensions are stored', () => {
    const textbox = createTextbox({
      sniptaleTextCalloutHeight: undefined,
      sniptaleTextCalloutWidth: undefined,
    });

    expect(getTextCalloutSurfaceSize(textbox as never, 'bubble')).toEqual({
      height: 120,
      width: 420,
    });
    expect(getTextCalloutFrame({ height: 1, width: 1 })).toEqual({
      height: 1,
      left: -0.5,
      top: -0.5,
      width: 1,
    });
  });
}

describe('text callout geometry', () => {
  registerSurfaceClampingTests();
  registerPlainLayoutTests();
  registerSharedSurfaceMathTests();
  registerBodyRectTests();
  registerVerticalAlignTests();
  registerFallbackTests();
});
