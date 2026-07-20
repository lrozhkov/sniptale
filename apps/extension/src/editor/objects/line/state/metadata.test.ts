import { expect, it } from 'vitest';
import { syncLineMetadata } from './metadata';

function createSettings(overrides: Record<string, unknown> = {}) {
  return {
    bowing: 0,
    color: '#111111',
    corners: 'round',
    fillColor: '#ffffff',
    fillMode: 'color',
    fillOpacity: 0.5,
    gradientAngle: 45,
    gradientFrom: '#000000',
    gradientTo: '#ffffff',
    opacity: 1,
    roughFillAngle: 0,
    roughFillBowing: 0,
    roughFillColor: '#ffffff',
    roughFillGap: 4,
    roughFillOpacity: 1,
    roughFillRoughness: 1,
    roughFillStyle: 'hachure',
    roughFillWeight: 1,
    roughness: 0,
    shadow: 0,
    style: 'solid',
    width: 4,
    ...overrides,
  };
}

it('syncs authoritative line metadata and removes absent gradient stops', () => {
  const line = { sniptaleLineGradientStops: [{ offset: 0, color: '#old' }] };

  syncLineMetadata(line as never, createSettings() as never, [{ x: 1, y: 2 }], true);

  expect(line).toMatchObject({
    sniptaleLineClosed: true,
    sniptaleLineColor: '#111111',
    sniptaleLinePoints: [{ x: 1, y: 2 }],
    sniptaleLinePointsJson: '[{"x":1,"y":2}]',
    sniptaleLineShadowAngle: 90,
    sniptaleLineShadowColor: '#111111',
  });
  expect('sniptaleLineGradientStops' in line).toBe(false);
});
