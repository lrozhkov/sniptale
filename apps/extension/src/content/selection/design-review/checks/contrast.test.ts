// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { readCheckContrast, checkContrastRatio } from './contrast';
afterEach(() => document.body.replaceChildren());
const style = (element: Element) => {
  const value = getComputedStyle(element);
  // JSDOM resolves authored text-shadow:none as a bare transparent color.
  if (element instanceof HTMLElement && element.style.textShadow === 'none')
    Object.defineProperty(value, 'textShadow', { value: 'none' });
  return value;
};
function fixture() {
  document.documentElement.style.cssText = '';
  document.body.style.cssText = 'background-color:rgb(255,255,255)';
  const target = document.createElement('p');
  target.style.cssText = 'font-size:16px;color:rgb(119,119,119);text-shadow:none';
  document.body.append(target);
  return target;
}
it('calculates sRGB contrast without rounding before threshold comparison', () => {
  const target = fixture();
  const result = readCheckContrast(target, style);
  expect(result.kind).toBe('measured');
  if (result.kind !== 'measured') throw new Error('Contrast unavailable');
  expect(result.ratio).toBeCloseTo(4.47809, 4);
  expect(result.ratio).toBeLessThan(result.required);
  target.style.color = 'rgb(118,118,118)';
  const passing = readCheckContrast(target, style);
  if (passing.kind !== 'measured') throw new Error('Contrast unavailable');
  expect(passing.ratio).toBeGreaterThan(passing.required);
  expect(
    checkContrastRatio(
      { red: 0, green: 0, blue: 0, alpha: 1 },
      { red: 255, green: 255, blue: 255, alpha: 1 }
    )
  ).toBe(21);
});
it('applies large-text thresholds to CSS pixels and actual weight', () => {
  const target = fixture();
  target.style.cssText = 'font-size:24px;color:rgb(136,136,136);text-shadow:none';
  expect(readCheckContrast(target, style)).toMatchObject({ kind: 'measured', required: 3 });
  target.style.fontSize = '18.6667px';
  target.style.fontWeight = '700';
  expect(readCheckContrast(target, style)).toMatchObject({ kind: 'measured', required: 3 });
  target.style.fontWeight = '600';
  expect(readCheckContrast(target, style)).toMatchObject({ kind: 'measured', required: 4.5 });
});
it('does not assume a white canvas or a passed result for gradient/transparent composition', () => {
  const target = fixture();
  document.body.style.backgroundColor = 'transparent';
  expect(readCheckContrast(target, style).kind).toBe('unknown');
  document.body.style.backgroundColor = 'rgb(255,255,255)';
  target.style.backgroundImage = 'linear-gradient(white,black)';
  expect(readCheckContrast(target, style).kind).toBe('unknown');
  target.style.backgroundImage = 'none';
  document.body.style.opacity = '.5';
  expect(readCheckContrast(target, style).kind).toBe('unknown');
});
it('treats pseudo paint and translucent foreground as unknown and invisible text as inapplicable', () => {
  const target = fixture();
  expect(readCheckContrast(target, style, () => true).kind).toBe('unknown');
  target.style.color = 'rgba(0,0,0,.5)';
  expect(readCheckContrast(target, style).kind).toBe('unknown');
  target.style.color = 'transparent';
  expect(readCheckContrast(target, style).kind).toBe('inapplicable');
});
