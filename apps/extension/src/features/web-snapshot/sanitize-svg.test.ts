// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { sanitizeWebSnapshotSvgText } from './sanitize-svg';

it('retains passive SVG geometry and internal paint references', () => {
  const svg = sanitizeWebSnapshotSvgText(
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" /></defs><path fill="url(#g)" d="M0 0h10v10z" /></svg>'
  );

  expect(svg).toContain('<path');
  expect(svg).toContain('url(&quot;#g&quot;)');
});

it('removes active content, event handlers and external resource references', () => {
  const svg = sanitizeWebSnapshotSvgText(
    [
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">',
      '<script>alert(1)</script><foreignObject><iframe /></foreignObject>',
      '<image href="https://tracker.example/pixel.png" />',
      '<style>.x { background: url(https://tracker.example/a.png); fill: red; }</style>',
      '<path class="x" onclick="alert(2)" d="M0 0h1v1z" />',
      '</svg>',
    ].join('')
  );

  expect(svg).toContain('<path');
  expect(svg).toContain('fill: red');
  expect(svg).not.toContain('script');
  expect(svg).not.toContain('foreignObject');
  expect(svg).not.toContain('tracker.example');
  expect(svg).not.toContain('onload');
  expect(svg).not.toContain('onclick');
});

it('rejects malformed or non-SVG documents', () => {
  expect(() => sanitizeWebSnapshotSvgText('<html />')).toThrow('invalid web snapshot SVG asset');
});
