import { Shadow } from 'fabric';
import { expect, it } from 'vitest';
import { createArrowPathStyle } from './style';

const settings = {
  color: '#ff6600',
  endHead: 'triangle',
  mode: 'straight',
  opacity: 0.5,
  shadow: 50,
  shadowColor: '#112233',
  startHead: 'none',
  style: 'dash',
  variant: 'standard',
  width: 6,
} as const;

it('creates transparent fill and stroked style for non-solid arrows', () => {
  const style = createArrowPathStyle(settings, 'dash');

  expect(style.fill).toBe('transparent');
  expect(String(style.stroke)).toContain('rgba');
  expect(style.strokeWidth).toBe(6);
  expect(style.strokeDashArray).toEqual(expect.arrayContaining([expect.any(Number)]));
  expect(style.shadow).toBeInstanceOf(Shadow);
});

it('creates filled style for solid arrows', () => {
  const style = createArrowPathStyle({ ...settings, shadow: 0 }, 'solid');

  expect(String(style.fill)).toContain('rgba');
  expect(style.stroke).toBe('transparent');
  expect(style.strokeWidth).toBe(0);
  expect(style.shadow).toBeUndefined();
});
