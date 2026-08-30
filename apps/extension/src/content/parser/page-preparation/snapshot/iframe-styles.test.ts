// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { materializePreparedSnapshotIframeStyles } from './iframe-styles';
import { mountStyleInAccessibleDocuments } from '../../../platform/frame';

function createFontFaceRule(family: string, source: string): CSSFontFaceRule {
  const declarations = `font-family: ${family}; src: ${source};`;
  return {
    cssText: `@font-face { ${declarations} }`,
    style: {
      cssText: declarations,
      getPropertyValue(property: string) {
        if (property === 'font-family') return family;
        return property === 'src' ? source : '';
      },
    },
  } as unknown as CSSFontFaceRule;
}

function appendVirtualIframe(
  snapshot: Document,
  originalIframe: HTMLIFrameElement,
  originals: Map<Node, Node>,
  parent: Element = snapshot.body
): HTMLElement {
  const container = snapshot.createElement('div');
  container.setAttribute('data-virtual-iframe', 'true');
  container.setAttribute('data-iframe-source', originalIframe.id);
  parent.append(container);
  originals.set(container, originalIframe);
  return container;
}

function materializeIframeStyles(snapshot: Document, originals: Map<Node, Node>): void {
  materializePreparedSnapshotIframeStyles(
    snapshot,
    (virtualElement) => originals.get(virtualElement) ?? null
  );
}

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

it('excludes an extension-owned runtime style mounted inside a readable iframe', () => {
  const iframe = document.createElement('iframe');
  iframe.id = 'runtime-frame';
  const iframeDocument = document.implementation.createHTMLDocument('runtime');
  Object.defineProperty(iframeDocument, 'readyState', { configurable: true, value: 'complete' });
  Object.defineProperty(iframe, 'contentDocument', { configurable: true, value: iframeDocument });
  document.body.append(iframe);
  const cleanup = mountStyleInAccessibleDocuments({
    styleId: 'sniptale-runtime-cursor',
    textContent: '* { cursor: crosshair !important; }',
  });

  try {
    const runtimeStyle = iframeDocument.getElementById('sniptale-runtime-cursor');
    if (!runtimeStyle) throw new Error('Expected runtime style in readable iframe');
    const runtimeSheet = new CSSStyleSheet();
    runtimeSheet.insertRule('* { cursor: crosshair !important; }');
    Object.defineProperty(runtimeSheet, 'ownerNode', { configurable: true, value: runtimeStyle });
    Object.defineProperty(iframeDocument, 'styleSheets', {
      configurable: true,
      value: [runtimeSheet],
    });
    const snapshot = document.implementation.createHTMLDocument('snapshot');
    const originals = new Map<Node, Node>();
    appendVirtualIframe(snapshot, iframe, originals);

    materializeIframeStyles(snapshot, originals);

    expect(snapshot.head.textContent).not.toContain('crosshair');
  } finally {
    cleanup();
  }
});

it('scopes readable iframe styles to their flattened virtual container', () => {
  const iframe = document.createElement('iframe');
  iframe.id = 'details-frame';
  const iframeDocument = document.implementation.createHTMLDocument('details');
  const iframeStyleSheet = new CSSStyleSheet();
  iframeStyleSheet.insertRule('.icon { font: italic 16px Icons; }');
  iframeStyleSheet.insertRule('body.panel .icon::before, .label { color: red; }');
  iframeStyleSheet.insertRule('body.missing .hidden { color: blue; }');
  iframeStyleSheet.insertRule('html body .deep { color: green; }');
  iframeStyleSheet.insertRule('html > body > .direct { color: purple; }');
  iframeStyleSheet.insertRule('.card:has(.icon) { border: 1px solid red; }');
  iframeStyleSheet.insertRule('.theme:is(.foo, body) .functional-root { color: black; }');
  iframeStyleSheet.insertRule('.theme:is(.foo, .bar) .functional-safe { color: teal; }');
  Object.defineProperty(iframeStyleSheet, 'cssRules', {
    configurable: true,
    value: [
      createFontFaceRule('Icons', 'url("data:font/woff;base64,d09GRgAAAAA=")'),
      ...Array.from(iframeStyleSheet.cssRules),
    ],
  });
  Object.defineProperty(iframeDocument, 'styleSheets', {
    configurable: true,
    value: [iframeStyleSheet],
  });
  iframeDocument.body.className = 'panel';
  Object.defineProperty(iframe, 'contentDocument', { configurable: true, value: iframeDocument });
  document.body.append(iframe);
  const snapshot = document.implementation.createHTMLDocument('snapshot');
  const originals = new Map<Node, Node>();
  const container = appendVirtualIframe(snapshot, iframe, originals);
  container.innerHTML = [
    '<span class="icon"></span>',
    '<span class="label"></span>',
    '<span class="hidden"></span>',
    '<span class="deep"></span>',
    '<span class="direct"></span>',
    '<span class="theme foo"><span class="functional-root"></span><span class="functional-safe"></span></span>',
  ].join('');

  materializeIframeStyles(snapshot, originals);

  const css = snapshot.querySelector('style')?.textContent ?? '';
  const scopeId = container.getAttribute('data-sniptale-iframe-style-scope');
  expect(scopeId).toMatch(/^sniptale-frame-[a-f0-9]{32}-1$/u);
  expect(css).toContain('data:font/woff');
  expect(css).toMatch(/sniptale-iframe-font-[a-f0-9]{32}-1-1/u);
  expect(css).toMatch(/font:\s*italic 16px "sniptale-iframe-font-[a-f0-9]{32}-1-1"/u);
  expect(css).not.toMatch(/font:\s*italic 16px Icons/iu);
  expect(css).toContain(`[data-sniptale-iframe-style-scope="${scopeId}"] .icon`);
  expect(css).toContain(`[data-sniptale-iframe-style-scope="${scopeId}"] .label`);
  expect(css).toContain(':not(*) .hidden');
  expect(css).toContain(`[data-sniptale-iframe-style-scope="${scopeId}"] .deep`);
  expect(css).toContain(`[data-sniptale-iframe-style-scope="${scopeId}"] > .direct`);
  expect(css).not.toContain(
    `[data-sniptale-iframe-style-scope="${scopeId}"] [data-virtual-iframe="true"]`
  );
  expect(css).not.toContain('.card:has');
  expect(css).not.toContain('.functional-root');
  expect(css).toContain('.theme:is(.foo, .bar) .functional-safe');
  expect(container.querySelector('.icon')?.getAttribute('data-sniptale-iframe-style-scope')).toBe(
    scopeId
  );
});

it('isolates nested iframe selectors and global names even when authored IDs collide', () => {
  const outerIframe = document.createElement('iframe');
  const innerIframe = document.createElement('iframe');
  outerIframe.id = 'reused-frame-id';
  innerIframe.id = 'reused-frame-id';
  const outerDocument = document.implementation.createHTMLDocument('outer');
  const innerDocument = document.implementation.createHTMLDocument('inner');
  const outerSheet = new CSSStyleSheet();
  outerSheet.insertRule('.status { color: red; font-family: Icons; }');
  outerSheet.insertRule('@font-face { font-family: Icons; src: url("/outer.woff"); }');
  outerSheet.insertRule('@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }');
  const relationalScopeCarrier = new CSSStyleSheet();
  relationalScopeCarrier.insertRule('@media all { .status { color: green; } }');
  const relationalScopeRule = relationalScopeCarrier.cssRules[0];
  if (!relationalScopeRule) throw new Error('Expected grouping-rule fixture');
  Object.defineProperty(relationalScopeRule, 'cssText', {
    configurable: true,
    value: '@scope (.outer:has(.status)) { .status { color: green; } }',
  });
  const containerCarrier = new CSSStyleSheet();
  containerCarrier.insertRule('@media all { .status { color: orange; } }');
  const containerRule = containerCarrier.cssRules[0];
  if (!containerRule) throw new Error('Expected container-rule fixture');
  Object.defineProperty(containerRule, 'cssText', {
    configurable: true,
    value: '@container (min-width: 1px) { .status { color: orange; } }',
  });
  const layerCarrier = new CSSStyleSheet();
  layerCarrier.insertRule('@media all { .status { color: purple; } }');
  const layerRule = layerCarrier.cssRules[0];
  if (!layerRule) throw new Error('Expected layer-rule fixture');
  Object.defineProperty(layerRule, 'cssText', {
    configurable: true,
    value: '@layer authored-frame { .status { color: purple; } }',
  });
  Object.defineProperty(outerSheet, 'cssRules', {
    configurable: true,
    value: [...Array.from(outerSheet.cssRules), relationalScopeRule, containerRule, layerRule],
  });
  const innerSheet = new CSSStyleSheet();
  innerSheet.insertRule('.status { color: blue; font-family: Icons; }');
  innerSheet.insertRule('@font-face { font-family: Icons; src: url("/inner.woff"); }');
  Object.defineProperty(outerDocument, 'styleSheets', { configurable: true, value: [outerSheet] });
  Object.defineProperty(innerDocument, 'styleSheets', { configurable: true, value: [innerSheet] });
  Object.defineProperty(outerIframe, 'contentDocument', {
    configurable: true,
    value: outerDocument,
  });
  Object.defineProperty(innerIframe, 'contentDocument', {
    configurable: true,
    value: innerDocument,
  });
  const snapshot = document.implementation.createHTMLDocument('snapshot');
  snapshot.head.innerHTML = [
    '<style>',
    '@keyframes pulse { to { opacity: .5; } }',
    '@font-face { font-family: "sniptale-iframe-font-1-1"; src: url("root.woff"); }',
    '</style>',
  ].join('');
  const originals = new Map<Node, Node>();
  const outerContainer = appendVirtualIframe(snapshot, outerIframe, originals);
  outerContainer.innerHTML = '<span id="outer-status" class="status"></span>';
  const innerContainer = appendVirtualIframe(snapshot, innerIframe, originals, outerContainer);
  innerContainer.innerHTML = '<span id="inner-status" class="status"></span>';

  materializeIframeStyles(snapshot, originals);

  const outerScope = outerContainer.getAttribute('data-sniptale-iframe-style-scope');
  const innerScope = innerContainer.getAttribute('data-sniptale-iframe-style-scope');
  expect(outerScope).toMatch(/^sniptale-frame-[a-f0-9]{32}-1$/u);
  expect(innerScope).toMatch(/^sniptale-frame-[a-f0-9]{32}-2$/u);
  expect(
    snapshot.getElementById('outer-status')?.getAttribute('data-sniptale-iframe-style-scope')
  ).toBe(outerScope);
  expect(
    snapshot.getElementById('inner-status')?.getAttribute('data-sniptale-iframe-style-scope')
  ).toBe(innerScope);
  const iframeCss = Array.from(
    snapshot.querySelectorAll('style[data-sniptale-captured-iframe-stylesheet]')
  ).map((style) => style.textContent ?? '');
  const captureToken = outerScope?.match(/^sniptale-frame-([a-f0-9]{32})-1$/u)?.[1];
  expect(captureToken).toBeTruthy();
  expect(iframeCss[0]).toContain(`sniptale-iframe-font-${captureToken}-1-1`);
  expect(iframeCss[0]).not.toContain(`sniptale-iframe-font-${captureToken}-2-1`);
  expect(iframeCss[1]).toContain(`sniptale-iframe-font-${captureToken}-2-1`);
  expect(iframeCss[1]).not.toContain(`sniptale-iframe-font-${captureToken}-1-1`);
  expect(iframeCss.join('\n')).not.toContain('@keyframes');
  expect(iframeCss.join('\n')).not.toContain('@scope');
  expect(iframeCss.join('\n')).not.toContain('@container');
  expect(iframeCss.join('\n')).not.toContain('@layer');
  expect(snapshot.head.firstElementChild?.textContent).toContain('@keyframes pulse');
});
