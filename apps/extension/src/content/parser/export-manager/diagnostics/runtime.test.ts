// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import {
  buildRuntimeApplicationMap,
  buildRuntimePageState,
  buildRuntimeResourceTiming,
} from './runtime';

beforeEach(() => {
  document.documentElement.innerHTML = `
    <head><script type="module" src="https://cdn.test/app.js?token=secret"></script></head>
    <body>
      <main id="app"><x-control></x-control><button aria-label="Save">Save</button></main>
      <form><input type="password" value="private-value"></form>
      <canvas width="20" height="10"></canvas>
    </body>
  `;
});

it('captures bounded page state and application structure without form values', () => {
  const source = { document, pageUrl: 'https://example.test/page?token=secret', view: window };
  const pageState = buildRuntimePageState(source);
  const applicationMap = buildRuntimeApplicationMap(source);
  const serialized = JSON.stringify(applicationMap);

  expect(pageState).toMatchObject({
    counts: { customElements: 1, forms: 1 },
    document: { url: 'https://example.test/page' },
  });
  expect(applicationMap).toMatchObject({
    customElements: ['x-control'],
    frameworkHints: [],
    importMaps: 0,
  });
  expect(serialized).toContain('canvas-or-webgl');
  expect(serialized).not.toContain('private-value');
  expect(serialized).not.toContain('secret');
});

it('captures sanitized resource timing metadata without headers or response bodies', () => {
  vi.spyOn(window.performance, 'getEntriesByType').mockReturnValue([
    {
      decodedBodySize: 120,
      duration: 24.4,
      encodedBodySize: 100,
      initiatorType: 'img',
      name: 'https://cdn.test/image.png?signature=secret#fragment',
      responseStatus: 200,
      startTime: 10.2,
      transferSize: 0,
    },
  ] as PerformanceResourceTiming[]);

  expect(buildRuntimeResourceTiming({ document, view: window })).toMatchObject({
    entries: [
      {
        cache: 'likely-cache-hit',
        duration: 24,
        responseStatus: 200,
        url: 'https://cdn.test/image.png',
      },
    ],
    omitted: 0,
    total: 1,
  });
});
