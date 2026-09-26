// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { getFrozenHitSamplingBoxes } from './frozen-hit-shapes';

it.each([
  'none',
  'matrix(1, 0, 0, 1, 50, 20)',
  'matrix(2, 0, 0, 2, 0, 0)',
  'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)',
])('does not pixel-scan a viewport wrapper with %s', (transform) => {
  const element = document.createElement('div');
  element.style.transform = transform;
  document.body.append(element);
  expect(getFrozenHitSamplingBoxes(element, { x: 0, y: 0, width: 1920, height: 1080 }, 2)).toEqual(
    []
  );
  element.remove();
});

it('samples only narrow rounded boundary bands, even for a large circular target', () => {
  const element = document.createElement('div');
  element.style.borderTopLeftRadius = '50%';
  element.style.borderTopRightRadius = '50%';
  element.style.borderBottomRightRadius = '50%';
  element.style.borderBottomLeftRadius = '50%';
  document.body.append(element);
  const bands = getFrozenHitSamplingBoxes(element, { x: 0, y: 0, width: 1000, height: 1000 }, 2);
  expect(bands.length).toBeGreaterThan(0);
  expect(bands.reduce((sum, band) => sum + band.width * band.height * 4, 0)).toBeLessThan(20_000);
  element.remove();
});

it.each(['rotate', 'reflection', 'ancestor-rotate', 'ancestor-reflection'])(
  'samples transformed hit regions for %s',
  (kind) => {
    const parent = document.createElement('div');
    const element = document.createElement('div');
    parent.append(element);
    document.body.append(parent);
    const transformed = kind.startsWith('ancestor-') ? parent : element;
    if (kind.endsWith('rotate')) transformed.style.rotate = '45deg';
    else transformed.style.transform = 'matrix(-1, 0, 0, 1, 0, 0)';
    element.style.borderTopLeftRadius = '90px';
    const rect = { x: 100, y: 100, width: 100, height: 100 };
    expect(getFrozenHitSamplingBoxes(element, rect, 1)).toEqual([rect]);
    parent.remove();
  }
);
