// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  isSafeWebSnapshotUrl,
  sanitizeWebSnapshotCssText,
  sanitizeWebSnapshotAttribute,
  sanitizeWebSnapshotFilename,
  sanitizeWebSnapshotHtml,
} from './sanitize';

it('sanitizes executable attributes and unsafe URLs for web snapshots', () => {
  expect(sanitizeWebSnapshotAttribute('onclick', 'alert(1)', 'https://example.com')).toBeNull();
  expect(
    sanitizeWebSnapshotAttribute('href', 'javascript:alert(1)', 'https://example.com')
  ).toBeNull();
  expect(sanitizeWebSnapshotAttribute('href', '/page', 'https://example.com')).toBe('/page');
  expect(
    sanitizeWebSnapshotAttribute(
      'srcset',
      '/image.png 1x, https://cdn.example.com/image@2x.png 2x',
      'https://example.com'
    )
  ).toBe('/image.png 1x, https://cdn.example.com/image@2x.png 2x');
  expect(
    sanitizeWebSnapshotAttribute(
      'srcset',
      '/image.png 1x, javascript:alert(1) 2x',
      'https://example.com'
    )
  ).toBeNull();
  expect(isSafeWebSnapshotUrl('https://example.com', null)).toBe(true);
  expect(isSafeWebSnapshotUrl('javascript:alert(1)', null)).toBe(false);
  expect(sanitizeWebSnapshotFilename('A / bad:name', 'fallback')).toBe('A_badname');
});

it('strips resource-bearing snapshot attributes and CSS fetch vectors', () => {
  expect(sanitizeWebSnapshotAttribute('formaction', 'https://example.com/post', null)).toBeNull();
  expect(sanitizeWebSnapshotAttribute('srcdoc', '<script>alert(1)</script>', null)).toBeNull();
  expect(sanitizeWebSnapshotAttribute('xlink:href', 'javascript:alert(1)', null)).toBeNull();
  expect(
    sanitizeWebSnapshotAttribute('href', 'data:text/html,<script>x</script>', null)
  ).toBeNull();
  expect(sanitizeWebSnapshotAttribute('src', 'blob:https://example.com/id', null)).toBeNull();
  expect(sanitizeWebSnapshotAttribute('src', 'data:image/png;base64,aW1n', null)).toBe(
    'data:image/png;base64,aW1n'
  );

  const css = sanitizeWebSnapshotCssText(`
    @import url("https://tracker.example/style.css");
    .hero { background: url("https://tracker.example/pixel.png"); color: red; }
  `);
  expect(css).not.toContain('@import');
  expect(css).not.toContain('tracker.example');
  expect(css).toContain('color: red');
});

it('drops obfuscated CSS fetch vectors without stripping benign string content', () => {
  expect(
    sanitizeWebSnapshotCssText(`
      .hero { background: u\\72l("https://tracker.example/pixel.png"); color: red; }
    `)
  ).toBe('');
  expect(
    sanitizeWebSnapshotCssText(`
      @im/* hidden */port "https://tracker.example/style.css";
      .hero { color: red; }
    `)
  ).toBe('');

  const benign = sanitizeWebSnapshotCssText('.label::before { content: "url(example)"; }');
  expect(benign).toContain('content: "url(example)"');
});

it('drops decoded unsafe CSS protocols and expression functions', () => {
  expect(sanitizeWebSnapshotCssText('.x { color: "\\6a avascript:alert(1)"; }')).toContain(
    '\\6a avascript'
  );
  expect(sanitizeWebSnapshotCssText('.x { color: \\6a avascript:alert(1); }')).toBe('');
  expect(sanitizeWebSnapshotCssText('.x { color: da\\74 a:text/html;base64,abc; }')).toBe('');
  expect(sanitizeWebSnapshotCssText('.x { width: expression(alert(1)); }')).toBe('');
});

it('keeps large benign CSS without suffix allocations in the fetch scanner', () => {
  const benignRule = '.card { color: red; content: "url(example)"; }';
  const css = Array.from({ length: 2000 }, () => benignRule).join('\n');

  expect(sanitizeWebSnapshotCssText(css)).toBe(css);
});

it('fails closed for malformed CSS escapes without throwing', () => {
  expect(() => sanitizeWebSnapshotCssText('.x { color: "\\110000"; }')).not.toThrow();
  expect(() => sanitizeWebSnapshotCssText('.x { color: "\\"; }')).not.toThrow();

  const escapedFetch = sanitizeWebSnapshotCssText(
    '.x { background: u\\ffffffrl("https://tracker.example/pixel.png"); }'
  );
  expect(escapedFetch).toBe('');
});

it('sanitizes restored web snapshot HTML before viewer rendering', () => {
  const html = sanitizeWebSnapshotHtml(
    [
      '<main>',
      '<script>window.evil = true</script>',
      '<meta http-equiv="refresh" content="0; url=https://tracker.example">',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<form action="https://tracker.example/post" method="post">',
      '<button formaction="https://tracker.example/post">Send</button>',
      '</form>',
      '<svg><a xlink:href="javascript:alert(1)">bad</a></svg>',
      '<img src="data:text/html,<script>x</script>" onerror="alert(1)">',
      '<style>.hero { background: u\\72l("https://tracker.example/pixel.png"); }</style>',
      '</main>',
    ].join(''),
    'https://example.com/page'
  );

  expect(html).not.toContain('<script');
  expect(html).not.toContain('http-equiv="refresh"');
  expect(html).not.toContain('<iframe');
  expect(html).not.toContain('formaction');
  expect(html).not.toContain('xlink:href');
  expect(html).not.toContain('data:text/html');
  expect(html).not.toContain('onerror');
  expect(html).not.toContain('tracker.example');
  expect(html).toContain('data-sniptale-disabled-form="true"');
});

it('keeps safe navigation links in offline viewer HTML while removing resource URLs', () => {
  const html = sanitizeWebSnapshotHtml(
    [
      '<img src="blob:snapshot-image" srcset="blob:snapshot-image 1x, https://tracker.example/i.png 2x">',
      '<a href="https://tracker.example/page">External</a>',
      '<a href="mailto:support@example.com">Mail</a>',
      '<link rel="stylesheet" href="https://tracker.example/style.css">',
      '<map><area href="https://tracker.example/map"></map>',
      '<svg><use href="https://tracker.example/icon.svg"></use></svg>',
      '<video poster="https://tracker.example/poster.png"></video>',
      '<img src="data:image/png;base64,aW1n">',
    ].join(''),
    'https://example.com/page',
    { allowedObjectUrls: ['blob:snapshot-image'], offlineOnly: true }
  );

  expect(html).toContain('src="blob:snapshot-image"');
  expect(html).toContain('href="https://tracker.example/page"');
  expect(html).toContain('href="mailto:support@example.com"');
  expect(html).toContain('src="data:image/png;base64,aW1n"');
  expect(html).not.toContain('srcset=');
  expect(html).not.toContain('https://tracker.example/style.css');
  expect(html).not.toContain('https://tracker.example/map');
  expect(html).not.toContain('https://tracker.example/icon.svg');
  expect(html).not.toContain('https://tracker.example/poster.png');
});
