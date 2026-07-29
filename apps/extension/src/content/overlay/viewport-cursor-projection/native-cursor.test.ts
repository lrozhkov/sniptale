// @vitest-environment jsdom

import { beforeEach, expect, it } from 'vitest';
import { createNativeCursorProjection } from './native-cursor';

const nativeCursorAttribute = 'data-sniptale-viewport-native-cursor';
const ownershipToken = 'projection-token';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

it('resolves the page cursor before hiding only the active target', () => {
  const pageStyle = document.createElement('style');
  pageStyle.textContent = '.blocked-target { cursor: not-allowed; }';
  document.head.append(pageStyle);
  const target = document.createElement('button');
  target.className = 'blocked-target';
  document.body.append(target);
  const projection = createNativeCursorProjection(document, ownershipToken);
  document.head.append(projection.style);

  expect(projection.resolveAndHide(target)).toBe('not-allowed');
  expect(target.getAttribute(nativeCursorAttribute)).toBe(ownershipToken);
  expect(projection.style.textContent).not.toContain('html *');

  projection.restore();
  expect(target.hasAttribute(nativeCursorAttribute)).toBe(false);
});

it('restores prior target state without overwriting a page-owned concurrent change', () => {
  const target = document.createElement('div');
  target.setAttribute(nativeCursorAttribute, 'page-before');
  document.body.append(target);
  const projection = createNativeCursorProjection(document, ownershipToken);
  document.head.append(projection.style);

  projection.resolveAndHide(target);
  projection.restore();
  expect(target.getAttribute(nativeCursorAttribute)).toBe('page-before');

  projection.resolveAndHide(target);
  target.setAttribute(nativeCursorAttribute, 'page-after');
  projection.dispose();
  expect(target.getAttribute(nativeCursorAttribute)).toBe('page-after');
  expect(projection.style.isConnected).toBe(false);
});

it('does not hide or misread page elements that already use the former marker value', () => {
  const pageStyle = document.createElement('style');
  pageStyle.textContent = `
    .inactive-target { cursor: pointer; }
    [${nativeCursorAttribute}="owned"] { cursor: not-allowed; }
  `;
  document.head.append(pageStyle);
  const inactiveTarget = document.createElement('div');
  inactiveTarget.className = 'inactive-target';
  inactiveTarget.setAttribute(nativeCursorAttribute, 'owned');
  const activeTarget = document.createElement('button');
  activeTarget.setAttribute(nativeCursorAttribute, 'owned');
  document.body.append(inactiveTarget, activeTarget);
  const projection = createNativeCursorProjection(document, ownershipToken);
  document.head.append(projection.style);

  expect(getComputedStyle(inactiveTarget).cursor).toBe('not-allowed');
  expect(projection.style.textContent).not.toContain('="owned"');
  expect(projection.resolveAndHide(activeTarget)).toBe('not-allowed');
  expect(activeTarget.getAttribute(nativeCursorAttribute)).toBe(ownershipToken);
  expect(inactiveTarget.getAttribute(nativeCursorAttribute)).toBe('owned');

  projection.restore();
  expect(activeTarget.getAttribute(nativeCursorAttribute)).toBe('owned');
});

it('owns and restores a shadow-root target with a root-local hiding style', () => {
  const host = document.createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const target = document.createElement('button');
  shadowRoot.append(target);
  document.body.append(host);
  const projection = createNativeCursorProjection(document, ownershipToken);
  document.head.append(projection.style);

  projection.resolveAndHide(target);

  const shadowStyle = shadowRoot.querySelector<HTMLStyleElement>(
    '[data-sniptale-viewport-cursor-style]'
  );
  expect(target.getAttribute(nativeCursorAttribute)).toBe(ownershipToken);
  expect(shadowStyle?.textContent).toContain(`="${ownershipToken}"`);

  projection.restore();
  expect(target.hasAttribute(nativeCursorAttribute)).toBe(false);
  expect(shadowStyle?.isConnected).toBe(true);

  projection.dispose();
  expect(shadowStyle?.isConnected).toBe(false);
  expect(projection.style.isConnected).toBe(false);
});
