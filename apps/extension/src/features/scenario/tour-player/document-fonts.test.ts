// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import canonicalFaces from '@sniptale/ui/styles/fonts?raw';
import canonicalTokens from '@sniptale/ui/styles/design-tokens?raw';
import interfaceLicense from '@fontsource-variable/inter/LICENSE?raw';
import { createTourDocument } from '../project/factories';
import { buildTourPlayerHtml, type TourPlayerLabels } from './document';
const labels: TourPlayerLabels = {
  expand: 'Expand explanation',
  collapse: 'Collapse explanation',
  previous: 'Back',
  next: 'Next',
  contents: 'Contents',
  close: 'Close',
  restart: 'Restart',
  finished: 'Finished',
  empty: 'Empty',
  point: 'Point',
  details: 'Details',
  play: 'Play',
  pause: 'Pause',
  seek: 'Playback position',
  retry: 'Retry',
  loading: 'Loading',
  mediaError: 'Image failed',
  choose: 'Choose a destination',
};

function fixture() {
  return { tour: createTourDocument('fonts'), title: 'Fonts', labels, assets: [] };
}

it('embeds canonical interface subsets, family and license without adding executable content', async () => {
  expect(canonicalFaces).toContain('@font-face');
  const html = await buildTourPlayerHtml(fixture());
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const css = doc.querySelector('style')!.textContent!;
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/gu)].map(([face]) => face);
  const canonical = [...canonicalFaces.matchAll(/@font-face\s*\{[^}]*\}/gu)]
    .map(([face]) => face)
    .filter((face) => face.includes("font-family: 'Sniptale Interface'"));
  expect(faces).toHaveLength(3);
  for (const [index, face] of faces.entries()) {
    expect(face.replace(/url\([^)]*\)/gu, 'url(embedded)')).toBe(
      canonical[index]!.replace(/url\([^)]*\)/gu, 'url(embedded)')
    );
    expect(face).toMatch(/url\(['"]data:font\/woff2;base64,[A-Za-z0-9+/]+=*['"]\)/u);
  }
  expect(css.match(/--sniptale-font-interface:\s*([^;]+);/u)?.[1]).toBe(
    canonicalTokens.match(/--sniptale-font-interface:\s*([^;]+);/u)![1]
  );
  expect(css.match(/url\([^)]*\)/gu)).toHaveLength(3);
  expect(css).not.toContain('@fontsource');
  expect(css).not.toContain('Sniptale Sans');
  expect(doc.querySelector('[data-tour-interface-font-license]')?.textContent).toBe(
    interfaceLicense
  );
  expect(doc.querySelector('[data-tour-interface-font-license]')?.hasAttribute('hidden')).toBe(
    true
  );
  expect(
    [...doc.querySelectorAll('script')].filter((node) => node.type !== 'application/json')
  ).toHaveLength(1);
  expect(doc.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain(
    'font-src data:;'
  );
});

it.each(['missing', 'duplicate', 'unexpected'] as const)(
  'refuses a %s canonical font subset before producing an artifact',
  async (change) => {
    const source =
      change === 'missing'
        ? canonicalFaces.replace(/@font-face\s*\{[^}]*\}/u, '')
        : change === 'duplicate'
          ? canonicalFaces.replace(
              'inter-cyrillic-wght-normal.woff2',
              'inter-latin-wght-normal.woff2'
            )
          : canonicalFaces.replace('inter-cyrillic-wght-normal.woff2', 'unknown.woff2');
    vi.resetModules();
    vi.doMock('@sniptale/ui/styles/fonts?raw', () => ({ default: source }));
    try {
      const { buildTourPlayerHtml: build } = await import('./document');
      await expect(build(fixture())).rejects.toThrow('Unexpected Tour interface font');
    } finally {
      vi.doUnmock('@sniptale/ui/styles/fonts?raw');
      vi.resetModules();
    }
  }
);
