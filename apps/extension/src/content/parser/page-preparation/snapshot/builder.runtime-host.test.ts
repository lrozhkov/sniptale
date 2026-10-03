// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { buildPreparedSnapshotDocument } from './builder';
afterEach(() => {
  document.body.replaceChildren();
});

it('omits only the empty identified WXT reclyp UI while preserving page components', async () => {
  const injected = document.createElement('reclyp-ui');
  injected.setAttribute('data-wxt-shadow-root', '');
  injected.style.cssText = 'width:0;height:0';
  injected.attachShadow({ mode: 'open' }).innerHTML =
    '<style>@font-face { font-family: Inter; src: url("data:font/woff2;base64,AAAA"); }</style><div id="reclyp-root"></div>';
  const pageComponent = document.createElement('page-card');
  pageComponent.attachShadow({ mode: 'open' }).innerHTML =
    '<style>:host { color:red }</style><p>Page content</p>';
  document.body.append(injected, pageComponent);
  const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });
  expect(result.html).not.toContain('reclyp-ui');
  expect(result.html).not.toContain('data:font/woff2');
  expect(result.html).toContain('Page content');
  expect(injected.isConnected).toBe(true);
});

it('preserves an identified reclyp host when it contains visible content', async () => {
  const host = document.createElement('reclyp-ui');
  host.setAttribute('data-wxt-shadow-root', '');
  host.attachShadow({ mode: 'open' }).innerHTML = '<div id="reclyp-root"><p>Keep content</p></div>';
  document.body.append(host);
  const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });
  expect(result.html).toContain('Keep content');
});
