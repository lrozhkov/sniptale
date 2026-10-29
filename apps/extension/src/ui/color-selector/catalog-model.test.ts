import { expect, it } from 'vitest';
import { lab, nearby, type CatalogColor } from './catalog-model';

it('preserves perceptual coordinates for black, white, and primary red', () => {
  expect(lab('#000000')).toEqual([0, 0, 0]);
  const white = lab('#ffffff');
  expect(white[0]).toBeCloseTo(1, 7);
  expect(white[1]).toBeCloseTo(0, 7);
  expect(white[2]).toBeCloseTo(0, 7);
  const red = lab('#ff0000');
  expect(red[0]).toBeCloseTo(0.62795536, 7);
  expect(red[1]).toBeCloseTo(0.22486306, 7);
  expect(red[2]).toBeCloseTo(0.1258463, 7);
});

it('offers a close shade while excluding the selected color and distant alternatives', () => {
  const colors: CatalogColor[] = [
    { name: 'Red', hex: '#ff0000', source: 'names' },
    { name: 'Near red', hex: '#ff0100', source: 'names' },
    { name: 'Blue', hex: '#0000ff', source: 'names' },
  ];
  expect(nearby(colors, '#ff0000').map((color) => color.name)).toEqual(['Near red']);
});
