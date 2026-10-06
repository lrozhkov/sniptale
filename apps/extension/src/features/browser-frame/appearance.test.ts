// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { composeWindowHeaderSvg } from './appearance';
import { DEFAULT_WINDOW_HEADER, parseWindowHeader } from './header';

describe('window artwork', () => {
  it('embeds fonts and escapes project text without remote resources', () => {
    const svg = composeWindowHeaderSvg(
      { ...DEFAULT_WINDOW_HEADER, title: '<script>"&', url: 'https://example.test/?x=<script>' },
      { width: 1920, height: 1080 }
    );
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('@font-face');
    expect(svg).not.toMatch(/(?:href|src)="https?:/);
  });
  it('uses a single contiguous tab and toolbar surface and equal menu dot pixel phases', () => {
    const svg = composeWindowHeaderSvg(DEFAULT_WINDOW_HEADER, { width: 931, height: 900 });
    expect(svg).toContain('V86H0V40Z');
    const dots = [...svg.matchAll(/<circle cx="909" cy="([\d.]+)" r="1"/g)].map((match) =>
      Number(match[1])
    );
    expect(dots).toEqual([59, 63, 67]);
    expect(new Set(dots.map((y) => y % 1)).size).toBe(1);
  });
  it('renders all twelve appearances without browser controls in applications', () => {
    for (const kind of ['browser', 'application'] as const)
      for (const style of ['windows', 'macos', 'linux'] as const)
        for (const theme of ['light', 'dark'] as const) {
          const svg = composeWindowHeaderSvg(
            { ...DEFAULT_WINDOW_HEADER, kind, style, theme, url: 'unique-address.test' },
            { width: 1080, height: 1920 }
          );
          expect(svg).not.toContain('NaN');
          expect(svg.includes('unique-address.test')).toBe(kind === 'browser');
        }
  });
});

it('projects admitted control-containing text into parseable XML without altering project text', () => {
  const title = 'Before\u0000\u0001\u000b\u000c\u001f\ufffe\uffffAfter 😀';
  const url = 'https://example.test/\u0002?name=\uffff';
  const header = { ...DEFAULT_WINDOW_HEADER, title, url };
  expect(parseWindowHeader(header)).toEqual(header);
  const svg = composeWindowHeaderSvg(header, { width: 1920, height: 1080 });
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  expect(document.querySelector('title')?.textContent).toBe('BeforeAfter 😀');
  expect(svg).toContain('https://example.test/?name=');
  expect(header.title).toBe(title);
});

it('keeps valid Unicode pairs while removing an incomplete pair in image title projection', () => {
  const svg = composeWindowHeaderSvg(
    { ...DEFAULT_WINDOW_HEADER, title: 'Title 😀 \ud800' },
    { width: 1920, height: 1080 }
  );
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  expect(document.querySelector('title')?.textContent).toBe('Title 😀 ');
});

it('contains wide browser labels inside their own fixed viewports, away from caption controls', () => {
  const svg = composeWindowHeaderSvg(
    { ...DEFAULT_WINDOW_HEADER, title: 'W'.repeat(80), url: 'W'.repeat(300) },
    { width: 1600, height: 900 }
  );
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const viewports = [...document.querySelectorAll('svg svg')];
  expect(
    viewports.map((viewport) => ({
      x: Number(viewport.getAttribute('x')),
      right: Number(viewport.getAttribute('x')) + Number(viewport.getAttribute('width')),
      overflow: viewport.getAttribute('overflow'),
    }))
  ).toEqual([
    { x: 78, right: 244, overflow: 'hidden' },
    { x: 157, right: 1450, overflow: 'hidden' },
  ]);
});

it('does not show a browser globe in a Windows application caption', () => {
  const svg = composeWindowHeaderSvg(
    { ...DEFAULT_WINDOW_HEADER, kind: 'application' },
    { width: 1600, height: 900 }
  );
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.querySelector('ellipse')).toBeNull();
  expect(doc.querySelector('text')?.getAttribute('x')).toBe('16');
});

it('lets the SVG font layout fill the tab label and fades its trailing edge', () => {
  const title = 'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii';
  const svg = composeWindowHeaderSvg(
    { ...DEFAULT_WINDOW_HEADER, title },
    { width: 1600, height: 900 }
  );
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.querySelector('text')?.textContent).toBe(title);
  expect(doc.querySelector('mask linearGradient, defs linearGradient')).not.toBeNull();
});

it('aligns the tab title baseline with the 20-unit favicon center', () => {
  const svg = composeWindowHeaderSvg(
    { ...DEFAULT_WINDOW_HEADER, title: 'Sniptale' },
    { width: 1600, height: 900 }
  );
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.querySelector('text')?.getAttribute('y')).toBe('23.5');
});
