import { describe, expect, it } from 'vitest';
import { updateQuickEditBackground } from './background';
import type { QuickEditBackgroundSettings } from './types';

const solid = {
  enabled: true,
  type: 'solid',
  color: '#000000ff',
  layout: { padding: 40, cornerRadius: 0 },
} as const;

const gradient = {
  type: 'linear',
  angle: 135,
  stops: [
    { id: 'a', color: '#111318ff', position: 0, midpoint: 0.5 },
    { id: 'b', color: '#2b2f3aff', position: 1, midpoint: 0.5 },
  ],
  interpolation: 'srgb',
  repeat: { enabled: false, span: 1 },
} as const;

describe('updateQuickEditBackground', () => {
  it('switches between none and paint settings using the default layout', () => {
    expect(updateQuickEditBackground({ enabled: false }, { enabled: true, type: 'solid' })).toEqual(
      {
        enabled: true,
        type: 'solid',
        color: '#000000ff',
        layout: { padding: 40, cornerRadius: 24 },
      }
    );
    expect(updateQuickEditBackground(solid, { enabled: false })).toEqual({ enabled: false });
  });

  it('keeps the paint and layout while the type stays and clamps new layout values', () => {
    const next = updateQuickEditBackground(solid, { layout: { padding: 5000, cornerRadius: -1 } });
    expect(next).toEqual({
      enabled: true,
      type: 'solid',
      color: '#000000ff',
      layout: { padding: 4096, cornerRadius: 0 },
    });
  });

  it('switches to a gradient only with gradient data and keeps the layout', () => {
    expect(updateQuickEditBackground(solid, { type: 'gradient' })).toEqual(solid);
    const next = updateQuickEditBackground(solid, {
      type: 'gradient',
      gradient: gradient as unknown as import('@sniptale/foundation/paint').Gradient,
    });
    expect(next).toMatchObject({
      enabled: true,
      type: 'gradient',
      layout: { padding: 40, cornerRadius: 0 },
    });
    expect(updateQuickEditBackground(next, { type: 'solid', color: '#ffffff00' })).toMatchObject({
      type: 'solid',
      color: '#ffffff00',
      layout: { padding: 40, cornerRadius: 0 },
    });
  });

  it('clamps image layout updates without touching the asset', () => {
    const image: QuickEditBackgroundSettings = {
      enabled: true,
      type: 'image',
      assetId: 'asset',
      imageFit: 'cover',
      layout: { padding: 10, cornerRadius: 5 },
    };
    expect(updateQuickEditBackground(image, { layout: { padding: 12, cornerRadius: 6 } })).toEqual({
      ...image,
      layout: { padding: 12, cornerRadius: 6 },
    });
  });
});
