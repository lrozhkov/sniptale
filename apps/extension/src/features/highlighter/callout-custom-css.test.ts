// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { projectCalloutLineCustomCss, resolveCalloutCustomCss } from './callout-custom-css';
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

it('projects canonical backdrop-filter to the React property without losing other sections', () => {
  const resolved = resolveCalloutCustomCss(
    '[card]\nbackdrop-filter: blur(16px) saturate(1.2);\n[title]\nopacity: .8;'
  );
  expect(resolved.error).toBeNull();
  expect(resolved.styles.card).toEqual({ backdropFilter: 'blur(16px) saturate(1.2)' });
  expect(resolved.styles.title).toEqual({ opacity: '0.8' });
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
  expect(resolveCalloutCustomCss('[card]\nmargin-left: 2px;').error).toBe('blocked');

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

it('projects only supported connector presentation properties', () => {
  expect(
    projectCalloutLineCustomCss({
      filter: 'blur(1px)',
      opacity: 0.5,
      stroke: '#f00',
      strokeDasharray: '2 1',
      strokeLinecap: 'round',
      strokeLinejoin: 'bevel',
    })
  ).toEqual({
    group: { filter: 'blur(1px)', opacity: 0.5 },
    line: {
      stroke: '#f00',
      strokeDasharray: '2 1',
      strokeLinecap: 'round',
      strokeLinejoin: 'bevel',
    },
  });
  expect(projectCalloutLineCustomCss({})).toEqual({ group: {}, line: {} });
});

const EMPTY_EXPECTED_STYLES = {
  accent: {},
  body: {},
  card: {},
  connector: {},
  title: {},
};
