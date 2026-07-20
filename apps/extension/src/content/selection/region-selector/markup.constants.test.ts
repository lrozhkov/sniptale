import { describe, expect, it } from 'vitest';
import {
  REGION_SELECTOR_BADGE_SURFACE_STYLE,
  REGION_SELECTOR_INSTRUCTION_STYLE,
  REGION_SELECTOR_MASK_STYLE,
  REGION_SELECTOR_OVERLAY_STYLE,
  REGION_SELECTOR_RESIZE_HANDLES,
  REGION_SELECTOR_SURFACE_STYLE,
} from './markup.constants';

describe('region-selector markup constants', () => {
  it('keeps the calmer matte surface contract for selector chrome', () => {
    expect(REGION_SELECTOR_RESIZE_HANDLES[0]?.style).toContain(
      'color-mix(in srgb, var(--sniptale-color-accent-soft) 18%, var(--sniptale-color-surface-panel) 82%)'
    );
    expect(REGION_SELECTOR_RESIZE_HANDLES[0]?.style).toContain('0 8px 18px');
    expect(REGION_SELECTOR_BADGE_SURFACE_STYLE).toContain(
      'color-mix(in srgb, var(--sniptale-color-surface-panel) 92%, var(--sniptale-color-surface-canvas) 8%)'
    );
    expect(REGION_SELECTOR_INSTRUCTION_STYLE).toContain('border-radius: 12px;');
    expect(REGION_SELECTOR_SURFACE_STYLE).toContain(
      'color-mix(in srgb, var(--sniptale-color-accent) 56%, var(--sniptale-color-border-soft) 44%)'
    );
    expect(REGION_SELECTOR_MASK_STYLE).toContain(
      'color-mix(in srgb, var(--sniptale-color-overlay) 72%, transparent)'
    );
    expect(REGION_SELECTOR_OVERLAY_STYLE).toContain('background: transparent;');
  });
});
