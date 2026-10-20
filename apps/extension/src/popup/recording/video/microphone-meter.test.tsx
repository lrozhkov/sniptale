// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getMicrophoneMeterLevel, MicrophoneMeter } from './microphone-meter';

it.each([0, -1, 0.001, Number.NaN, Number.POSITIVE_INFINITY])(
  'keeps silence and invalid microphone input empty: %s',
  (level) => expect(getMicrophoneMeterLevel(level)).toBe(0)
);

it('makes quiet speech readable without treating it as clipping', () => {
  expect(getMicrophoneMeterLevel(0.01)).toBeCloseTo(1 / 3);
  expect(getMicrophoneMeterLevel(0.02)).toBeGreaterThan(0.4);
  expect(getMicrophoneMeterLevel(0.1)).toBeCloseTo(2 / 3);
  expect(getMicrophoneMeterLevel(1)).toBe(1);
  expect(getMicrophoneMeterLevel(2)).toBe(1);
  const markup = renderToStaticMarkup(<MicrophoneMeter label="Microphone" level={0.02} />);
  expect(markup).toContain('aria-valuenow="43"');
  expect(markup).toContain('color-success');
  expect(markup).not.toContain('color-danger');
});

it('animates transform instead of layout and respects reduced motion', () => {
  const markup = renderToStaticMarkup(<MicrophoneMeter label="Microphone" level={0.1} />);
  expect(markup).toContain('transition-[transform,background-color]');
  expect(markup).toContain('motion-reduce:transition-none');
  expect(markup).toContain('scaleX(');
  expect(markup).not.toContain('width:');
});

it.each([
  [0.3, 'color-warning'],
  [0.95, 'color-danger'],
] as const)('uses input headroom for high-level feedback: %s', (level, color) => {
  expect(renderToStaticMarkup(<MicrophoneMeter label="Microphone" level={level} />)).toContain(
    color
  );
});
