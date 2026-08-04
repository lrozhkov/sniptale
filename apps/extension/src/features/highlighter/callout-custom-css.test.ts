// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { resolveCalloutCustomCss } from './callout-custom-css';
import { createSystemCalloutPresetCatalog } from './callout-presets/catalog';

it('projects one field into fixed callout targets', () => {
  const resolved = resolveCalloutCustomCss(`
[card]
box-shadow: 0 3px 12px rgba(0, 0, 0, .2);
[title]
text-transform: uppercase;
letter-spacing: 1px;
[connector]
stroke: #ff0000;
stroke-dasharray: 6 3;
  `);

  expect(resolved.error).toBeNull();
  expect(resolved.styles.card).toEqual({ boxShadow: '0 3px 12px rgba(0, 0, 0, .2)' });
  expect(resolved.styles.title).toMatchObject({ letterSpacing: '1px', textTransform: 'uppercase' });
  expect(resolved.styles.connector).toEqual({ stroke: '#ff0000', strokeDasharray: '6 3' });
});

it('treats declarations without a section as card styles', () => {
  expect(resolveCalloutCustomCss('filter: drop-shadow(0 2px 3px #000);').styles.card).toEqual({
    filter: 'drop-shadow(0 2px 3px #000)',
  });
});

it('accepts every scoped style shipped by the system preset catalog', () => {
  for (const preset of createSystemCalloutPresetCatalog()) {
    expect(resolveCalloutCustomCss(preset.style.customCss), preset.id).toMatchObject({
      blockedProperties: [],
      error: null,
    });
  }
});

it('fails closed for geometry, unknown targets, and fetch-capable CSS', () => {
  const geometry = resolveCalloutCustomCss('[card]\nposition: fixed; box-shadow: 0 0 2px red;');
  expect(geometry).toMatchObject({ error: 'blocked', styles: EMPTY_EXPECTED_STYLES });
  expect(geometry.blockedProperties).toContain('position');

  expect(resolveCalloutCustomCss('[page]\ncolor: red;').error).toBe('syntax');
  expect(
    resolveCalloutCustomCss('[card]\nbackground-image: url(https://example.com/x);').error
  ).toBe('unsafe');
  expect(
    resolveCalloutCustomCss('[card]\nbackground-image: u&#114;l(https://attacker.example/pixel);')
      .error
  ).not.toBeNull();
  expect(
    resolveCalloutCustomCss(
      '[card]\nbackground-image: image-set("https://attacker.example/pixel" 1x);'
    ).error
  ).toBe('unsafe');
  expect(resolveCalloutCustomCss('[card]\nbackground-image: var(--page-image);').error).toBe(
    'unsafe'
  );
  expect(resolveCalloutCustomCss('[card]\nmade-up: 1; color: red;').error).toBe('syntax');
  expect(resolveCalloutCustomCss('[card]\ncolor: red; broken').error).toBe('syntax');
});

const EMPTY_EXPECTED_STYLES = {
  accent: {},
  body: {},
  card: {},
  connector: {},
  title: {},
};
