// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { materializePreparedSnapshotStyles } from './styles';

afterEach(() => {
  document.head
    .querySelectorAll('style[data-test-snapshot-style]')
    .forEach((style) => style.remove());
  document.body.style.removeProperty('font-family');
  document.body.style.removeProperty('font-size');
  Object.defineProperty(document, 'adoptedStyleSheets', {
    configurable: true,
    value: [],
  });
});

it('materializes CSSOM rules that are absent from cloned style text', () => {
  const sourceStyle = document.createElement('style');
  sourceStyle.setAttribute('data-test-snapshot-style', 'true');
  document.head.appendChild(sourceStyle);
  sourceStyle.sheet?.insertRule('.runtime-rule { color: rgb(1, 2, 3); }');
  expect(sourceStyle.textContent).toBe('');

  const snapshot = document.implementation.createHTMLDocument('snapshot');
  snapshot.head.appendChild(snapshot.importNode(sourceStyle, true));
  materializePreparedSnapshotStyles(document, snapshot);

  const captured = snapshot.querySelector('style[data-sniptale-captured-stylesheet="true"]');
  expect(captured?.textContent).toContain('.runtime-rule');
  expect(captured?.textContent).toContain('rgb(1, 2, 3)');
});

it('preserves authored inline shorthand bytes that CSSOM serializes lossily', () => {
  const sourceStyle = document.createElement('style');
  sourceStyle.setAttribute('data-test-snapshot-style', 'true');
  sourceStyle.textContent = [
    ':root { --border: #ddd; }',
    '.card { border: 1px solid var(--border); border-left: 4px solid red; }',
  ].join('\n');
  document.head.appendChild(sourceStyle);
  const snapshot = document.implementation.createHTMLDocument('snapshot');

  materializePreparedSnapshotStyles(document, snapshot);

  const captured = snapshot.querySelector('style[data-sniptale-captured-stylesheet="true"]');
  expect(captured?.textContent).toContain('border: 1px solid var(--border)');
  expect(captured?.textContent).not.toContain('border-top-color: ;');
});

it('keeps appended runtime CSSOM rules after lossless authored inline CSS', () => {
  const sourceStyle = document.createElement('style');
  sourceStyle.setAttribute('data-test-snapshot-style', 'true');
  sourceStyle.textContent = '.card { border: 1px solid var(--border); }';
  document.head.appendChild(sourceStyle);
  sourceStyle.sheet?.insertRule(
    '.runtime-rule { color: rgb(1, 2, 3); }',
    sourceStyle.sheet.cssRules.length
  );
  const snapshot = document.implementation.createHTMLDocument('snapshot');

  materializePreparedSnapshotStyles(document, snapshot);

  const captured = snapshot.querySelector('style[data-sniptale-captured-stylesheet="true"]');
  expect(captured?.textContent).toContain('border: 1px solid var(--border)');
  expect(captured?.textContent).toContain('.runtime-rule');
});

it('preserves linked stylesheet bytes instead of lossy CSSOM shorthand serialization', () => {
  const source = document.implementation.createHTMLDocument('source');
  const link = source.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://example.test/theme.css';
  source.head.appendChild(link);
  Object.defineProperty(source, 'styleSheets', {
    configurable: true,
    value: [
      {
        disabled: false,
        href: link.href,
        ownerNode: link,
      },
    ],
  });
  const snapshot = document.implementation.createHTMLDocument('snapshot');

  materializePreparedSnapshotStyles(source, snapshot);

  const preserved = snapshot.querySelector('link[rel~="stylesheet"]');
  expect(preserved?.getAttribute('href')).toBe('https://example.test/theme.css');
  expect(snapshot.querySelector('style[data-sniptale-captured-stylesheet]')).toBeNull();
});

it('preserves stylesheet order and media conditions', () => {
  for (const cssText of ['.first { color: red; }', '.second { color: blue; }']) {
    const style = document.createElement('style');
    style.setAttribute('data-test-snapshot-style', 'true');
    style.textContent = cssText;
    document.head.appendChild(style);
  }
  document.head
    .querySelectorAll('style[data-test-snapshot-style]')[1]
    ?.setAttribute('media', 'screen');
  const snapshot = document.implementation.createHTMLDocument('snapshot');

  materializePreparedSnapshotStyles(document, snapshot);

  const styles = Array.from(snapshot.querySelectorAll('style'));
  expect(styles).toHaveLength(2);
  expect(styles[0]?.textContent).toContain('.first');
  expect(styles[1]?.textContent).toContain('@media screen');
  expect(styles[1]?.textContent).toContain('.second');
});

it('materializes adopted stylesheets after document styles in cascade order', () => {
  const sourceStyle = document.createElement('style');
  sourceStyle.setAttribute('data-test-snapshot-style', 'true');
  sourceStyle.textContent = '.card { color: red; }';
  document.head.appendChild(sourceStyle);
  const adoptedStyleSheet = new CSSStyleSheet();
  adoptedStyleSheet.insertRule('.card { color: blue; }');
  Object.defineProperty(document, 'adoptedStyleSheets', {
    configurable: true,
    value: [adoptedStyleSheet],
  });
  const snapshot = document.implementation.createHTMLDocument('snapshot');

  materializePreparedSnapshotStyles(document, snapshot);

  const capturedStyles = Array.from(
    snapshot.querySelectorAll('style[data-sniptale-captured-stylesheet="true"]')
  );
  expect(capturedStyles).toHaveLength(2);
  expect(capturedStyles[0]?.textContent).toContain('color: red');
  expect(capturedStyles[1]?.textContent).toContain('color: blue');
});

it('drops an unsafe CSS rule without discarding safe sibling rules', () => {
  const style = document.createElement('style');
  style.setAttribute('data-test-snapshot-style', 'true');
  style.textContent = [
    '.safe-before { color: green; }',
    '.unsafe { width: expression(alert(1)); }',
    '.safe-after { display: grid; }',
  ].join('\n');
  document.head.appendChild(style);
  const snapshot = document.implementation.createHTMLDocument('snapshot');

  materializePreparedSnapshotStyles(document, snapshot);

  const css = snapshot.querySelector('style')?.textContent ?? '';
  expect(css).toContain('.safe-before');
  expect(css).toContain('.safe-after');
  expect(css).not.toContain('expression');
});

it('resolves CSSOM resource URLs against the source document for later packaging', () => {
  const style = document.createElement('style');
  style.setAttribute('data-test-snapshot-style', 'true');
  style.textContent = '.hero { background-image: url("/hero.png"); }';
  document.head.appendChild(style);
  const snapshot = document.implementation.createHTMLDocument('snapshot');

  materializePreparedSnapshotStyles(document, snapshot);

  expect(snapshot.querySelector('style')?.textContent).toContain(
    'url("http://localhost:3000/hero.png")'
  );
});

it('pins the captured body font size after site cascade layers', () => {
  const style = document.createElement('style');
  style.setAttribute('data-test-snapshot-style', 'true');
  style.textContent = '@layer site { body { font-size: 14px; } }';
  document.head.appendChild(style);
  document.body.style.fontFamily = 'Inter, sans-serif';
  document.body.style.fontSize = '14px';
  const snapshot = document.implementation.createHTMLDocument('snapshot');

  materializePreparedSnapshotStyles(document, snapshot);

  const styles = Array.from(snapshot.querySelectorAll('style'));
  const environmentStyle = styles.at(-1);
  expect(environmentStyle?.getAttribute('data-sniptale-captured-rendering-environment')).toBe(
    'true'
  );
  expect(environmentStyle?.textContent).toBe(
    'body { font-family: Inter, sans-serif; font-size: 14px; }'
  );
});
