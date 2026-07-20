import { describe, expect, it } from 'vitest';

import { isScenarioColorToken, resolveScenarioColorToken } from './color-token';

describe('scenario color tokens', () => {
  it('accepts bounded hex, rgb, rgba, hsl, hsla, and transparent tokens', () => {
    expect(isScenarioColorToken('#fff')).toBe(true);
    expect(isScenarioColorToken('#112233cc')).toBe(true);
    expect(isScenarioColorToken('rgb(255, 255, 255)')).toBe(true);
    expect(isScenarioColorToken('rgba(15,143,138,0.12)')).toBe(true);
    expect(isScenarioColorToken('rgb(0 0 0 / 33%)')).toBe(true);
    expect(isScenarioColorToken('hsl(210, 50%, 40%)')).toBe(true);
    expect(isScenarioColorToken('hsla(210 50% 40% / 0.8)')).toBe(true);
    expect(isScenarioColorToken('transparent')).toBe(true);
  });

  it('rejects SVG paint references and malformed color values', () => {
    expect(isScenarioColorToken('url(https://tracker.test/paint.svg#x)')).toBe(false);
    expect(isScenarioColorToken('u\\72l(https://tracker.test/paint.svg#x)')).toBe(false);
    expect(isScenarioColorToken('paint(#gradient)')).toBe(false);
    expect(isScenarioColorToken('rgb(999, 0, 0)')).toBe(false);
    expect(isScenarioColorToken('rgba(0, 0, 0, 2)')).toBe(false);
    expect(isScenarioColorToken('hsl(400, 50%, 50%)')).toBe(false);
    expect(isScenarioColorToken(' var(--brand)')).toBe(false);
  });

  it('falls back before render when a paint token is unsafe', () => {
    expect(resolveScenarioColorToken('url(https://tracker.test/paint.svg#x)', '#111111')).toBe(
      '#111111'
    );
  });
});
