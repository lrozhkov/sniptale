// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  isSafeWebSnapshotUrl,
  sanitizeWebSnapshotCssText,
  sanitizeWebSnapshotAttribute,
  sanitizeWebSnapshotFilename,
  sanitizeWebSnapshotHtml,
  shouldExcludeWebSnapshotFormControlValue,
} from './sanitize';

it.each([
  'cc-name',
  'cc-given-name',
  'cc-additional-name',
  'cc-family-name',
  'cc-number',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'cc-csc',
  'cc-type',
  'transaction-amount',
  'transaction-currency',
])('classifies the recognized payment autocomplete token %s as sensitive', (autocomplete) => {
  const control = document.createElement('input');
  control.setAttribute('autocomplete', autocomplete);

  expect(shouldExcludeWebSnapshotFormControlValue(control)).toBe(true);
});

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

it('preserves only CSS resource URLs approved by the offline asset rewriter', () => {
  const css = sanitizeWebSnapshotCssText(
    [
      '@import url("https://tracker.example/import.css");',
      '.hero { background: url("https://cdn.example/hero.png"); }',
      '.icon { mask: url("javascript:alert(1)"); }',
    ].join('\n'),
    (url) => (url === 'https://cdn.example/hero.png' ? '../assets/hero.png' : null)
  );

  expect(css).toContain('url("../assets/hero.png")');
  expect(css).not.toContain('@import');
  expect(css).not.toContain('tracker.example');
  expect(css).not.toContain('javascript');
});

it('preserves only rewritten URL and string-form stylesheet imports', () => {
  expect(
    sanitizeWebSnapshotCssText(
      '@import url("https://cdn.example/theme.css") screen; .card { color: red; }',
      (url) => (url === 'https://cdn.example/theme.css' ? '../assets/theme.css' : null)
    )
  ).toContain('@import url("../assets/theme.css") screen;');
  expect(
    sanitizeWebSnapshotCssText('@import url("https://cdn.example/theme.css");', () => null)
  ).toBe('');
  expect(
    sanitizeWebSnapshotCssText('@import "./theme.css" print;', (url) =>
      url === './theme.css' ? '../assets/theme.css' : null
    )
  ).toContain('@import url("../assets/theme.css") print;');
  expect(sanitizeWebSnapshotCssText('@import "./theme.css";', () => null)).toBe('');
  expect(sanitizeWebSnapshotCssText('@import "./theme.css;', () => '../assets/theme.css')).toBe('');
  expect(
    sanitizeWebSnapshotCssText(
      '@im/* hidden */port url("https://cdn.example/theme.css");',
      () => '../assets/theme.css'
    )
  ).toBe('');
});

it('removes an import whose quoted URL contains semicolons without corrupting following CSS', () => {
  const css = sanitizeWebSnapshotCssText(
    [
      "@import url('https://fonts.googleapis.com/css2?family=Onest:wght@400;600;700&display=swap');",
      'body { color: rgb(12, 34, 56); }',
    ].join('\n')
  );

  expect(css).not.toContain('@import');
  expect(css).not.toContain('600;700');
  expect(css).not.toContain('fonts.googleapis.com');
  expect(css).toContain('body { color: rgb(12, 34, 56); }');
});

it('parses whitespace and escapes in rewritten CSS URL functions', () => {
  const rewritten = sanitizeWebSnapshotCssText(
    '.hero { background: url  (  "https://cdn.example/im\\age.png"  ); }',
    (url) => (url === 'https://cdn.example/im\\age.png' ? '../assets/image.png' : null)
  );

  expect(rewritten).toContain('url("../assets/image.png")');
});

it('fails closed for malformed URL functions and preserves benign block comments', () => {
  const malformed = sanitizeWebSnapshotCssText(
    '.bad { background: url("https://cdn.example/image.png" trailing); color: red; }',
    () => '../assets/image.png'
  );
  const unterminated = sanitizeWebSnapshotCssText(
    '.bad { background: url("https://cdn.example/image.png); color: red; }',
    () => '../assets/image.png'
  );
  const commented = sanitizeWebSnapshotCssText('.ok { /* note */ color: green; }');

  expect(malformed).not.toContain('cdn.example');
  expect(unterminated).not.toContain('cdn.example');
  expect(commented).toContain('color: green');
});

it('preserves literal CSS variables only after their resource values pass rewriting', () => {
  const css = sanitizeWebSnapshotCssText(
    ':root { --hero: url("https://cdn.example/hero.png"); } .hero { background: var(--hero); }',
    (url) => (url.startsWith('https://cdn.example/') ? '../assets/hero.png' : null)
  );

  expect(css).toContain('--hero: url("../assets/hero.png")');
  expect(css).toContain('var(--hero)');
  expect(sanitizeWebSnapshotCssText('.hero { background: var(--hero); }')).toBe('');
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

it.each(['\n', '\r', '\r\n', '\f'])(
  'drops a suffix fetch after a bad CSS string terminated by %j',
  (lineBreak) => {
    const css = `.x { color: "broken${lineBreak}; background-image: url(https://attacker.example/pixel); }`;

    expect(sanitizeWebSnapshotCssText(css)).toBe('');
  }
);

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

it('freezes defined selectors for custom and native elements without rewriting strings', () => {
  const css = sanitizeWebSnapshotCssText(
    [
      'snapshot-card:defined { display: block; }',
      'snapshot-card:not(:defined) { display: none; }',
      'button:defined { opacity: 1; }',
      'snapshot-card:DEFINED { color: green; }',
      'snapshot-card:de\\66 ined { visibility: visible; }',
      'snapshot-card:/* capture-state */defined { position: relative; }',
      '.label::before { content: ":defined"; }',
    ].join('\n')
  );

  expect(css).toContain('snapshot-card:not([data-sniptale-custom-element-undefined])');
  expect(css).toContain('snapshot-card:not(:not([data-sniptale-custom-element-undefined]))');
  expect(css).toContain('button:not([data-sniptale-custom-element-undefined])');
  expect(css).toContain(
    'snapshot-card:not([data-sniptale-custom-element-undefined]) { color: green; }'
  );
  expect(css).toContain(
    'snapshot-card:not([data-sniptale-custom-element-undefined]) { visibility: visible; }'
  );
  expect(css).toContain(
    'snapshot-card:not([data-sniptale-custom-element-undefined]) { position: relative; }'
  );
  expect(css).toContain('content: ":defined"');
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
      '<input type="password" value="stored-secret">',
      '<input autocomplete="section-login one-time-code webauthn" value="123456">',
      '<input type="hidden" value="csrf-secret">',
      '<input autocomplete="billing cc-number" value="4111111111111111">',
      '<input type="checkbox" autocomplete="one-time-code" checked>',
      '<textarea autocomplete="one-time-code" value="textarea-attribute-code">',
      'textarea-code</textarea>',
      '<select autocomplete="cc-type" value="select-card">',
      '<option label="restored-card-label" value="4111-restored-option" selected>',
      'restored-card-number</option></select>',
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
  expect(html).not.toContain('stored-secret');
  expect(html).not.toContain('123456');
  expect(html).not.toContain('csrf-secret');
  expect(html).not.toContain('4111111111111111');
  expect(html).not.toContain('textarea-code');
  expect(html).not.toContain('textarea-attribute-code');
  expect(html).not.toContain('select-card');
  expect(html).not.toContain('4111-restored-option');
  expect(html).not.toContain('restored-card-number');
  expect(html).not.toContain('restored-card-label');
  expect(html).not.toContain('<option selected');
  expect(html).not.toContain('type="checkbox" autocomplete="one-time-code" checked');
  expect(html).not.toContain('xlink:href');
  expect(html).not.toContain('data:text/html');
  expect(html).not.toContain('onerror');
  expect(html).not.toContain('tracker.example');
  expect(html).toContain('data-sniptale-disabled-form="true"');
});

it('sanitizes active content and credentials inside declarative shadow roots', () => {
  const html = sanitizeWebSnapshotHtml(
    [
      '<section><template shadowrootmode="open">',
      '<script>window.shadowEvil = true</script>',
      '<input type="hidden" value="shadow-token">',
      '<input type="checkbox" autocomplete="one-time-code" checked>',
      '<template shadowrootmode="open">',
      '<textarea autocomplete="one-time-code" value="nested-text-attribute-code">',
      'nested-text-code</textarea>',
      '<select autocomplete="cc-name" value="nested-select-card">',
      '<option label="nested-card-label" value="nested-option-card" selected>nested-card-number</option></select>',
      '</template>',
      '<img src="https://tracker.example/shadow.png" onerror="alert(1)">',
      '</template></section>',
    ].join(''),
    'https://example.com/page',
    { offlineOnly: true }
  );

  expect(html).toContain('shadowrootmode="open"');
  expect(html).not.toContain('shadowEvil');
  expect(html).not.toContain('shadow-token');
  expect(html).not.toContain('nested-text-code');
  expect(html).not.toContain('nested-text-attribute-code');
  expect(html).not.toContain('nested-select-card');
  expect(html).not.toContain('nested-option-card');
  expect(html).not.toContain('nested-card-number');
  expect(html).not.toContain('nested-card-label');
  expect(html).not.toContain('type="checkbox" autocomplete="one-time-code" checked');
  expect(html).not.toContain('<option selected');
  expect(html).not.toContain('tracker.example');
  expect(html).not.toContain('onerror');
});

it('removes all navigation targets and external resource URLs from offline viewer HTML', () => {
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
  expect(html).not.toContain('href="https://tracker.example/page"');
  expect(html).not.toContain('href="mailto:support@example.com"');
  expect(html).toContain('src="data:image/png;base64,aW1n"');
  expect(html).not.toContain('srcset=');
  expect(html).not.toContain('https://tracker.example/style.css');
  expect(html).not.toContain('https://tracker.example/map');
  expect(html).not.toContain('https://tracker.example/icon.svg');
  expect(html).not.toContain('https://tracker.example/poster.png');
});
