// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { capturePreparedSnapshotLiveState } from './live-state';
import { buildInertPreparedSnapshotVirtualDom } from './inert-virtual-dom';

function materializeDocumentLiveState(beforeInertImport?: () => void) {
  const virtualSnapshot = buildInertPreparedSnapshotVirtualDom(document, document.body);
  const liveState = capturePreparedSnapshotLiveState(
    virtualSnapshot.root,
    virtualSnapshot.resolveOriginalElement
  );
  beforeInertImport?.();
  const snapshot = virtualSnapshot.root;
  const warnings = liveState.materialize(snapshot);
  return { snapshot, warnings };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

it('copies current form state rather than stale markup defaults', () => {
  document.body.innerHTML = [
    '<input value="old"><input type="checkbox">',
    '<textarea>old</textarea><select><option>First</option><option>Second</option></select>',
    '<details><summary>More</summary></details>',
  ].join('');
  const [text, checkbox] = Array.from(document.querySelectorAll('input'));
  if (!text || !checkbox) throw new Error('Expected form controls');
  text.value = 'current';
  checkbox.checked = true;
  const textarea = document.querySelector('textarea');
  const select = document.querySelector('select');
  const details = document.querySelector('details');
  if (!textarea || !select || !details) throw new Error('Expected live controls');
  textarea.value = 'current text';
  select.selectedIndex = 1;
  details.open = true;

  const { snapshot, warnings } = materializeDocumentLiveState();
  expect(warnings).toEqual([]);

  expect(snapshot.querySelector('input')?.getAttribute('value')).toBe('current');
  expect(snapshot.querySelector('input[type="checkbox"]')?.hasAttribute('checked')).toBe(true);
  expect(snapshot.querySelector('textarea')?.textContent).toBe('current text');
  expect(snapshot.querySelectorAll('option')[1]?.hasAttribute('selected')).toBe(true);
  expect(snapshot.querySelector('details')?.hasAttribute('open')).toBe(true);
});

it('removes credential values while retaining ordinary live form state', () => {
  document.body.innerHTML = [
    '<input name="query" value="old">',
    '<input type="password" value="markup-secret">',
    '<input autocomplete="section-login one-time-code webauthn" value="markup-code">',
    '<input type="hidden" value="csrf-token">',
    '<input autocomplete="billing cc-number" value="4111111111111111">',
    '<input type="checkbox" autocomplete="one-time-code" checked>',
    '<textarea autocomplete="one-time-code" value="text-attribute-code">markup-text-code</textarea>',
    '<select autocomplete="cc-number" value="select-card">',
    '<option value="4111111111111111">4111111111111111</option>',
    '<option selected>12</option></select>',
  ].join('');
  const [query, password, oneTimeCode, hidden, card, sensitiveCheckbox] = Array.from(
    document.querySelectorAll('input')
  );
  if (!query || !password || !oneTimeCode || !hidden || !card || !sensitiveCheckbox) {
    throw new Error('Expected form controls');
  }
  query.value = 'current query';
  password.value = 'current-secret';
  oneTimeCode.value = '123456';
  hidden.value = 'current-csrf-token';
  card.value = '5555555555554444';
  sensitiveCheckbox.checked = true;
  const sensitiveTextarea = document.querySelector('textarea');
  const sensitiveSelect = document.querySelector('select');
  if (!sensitiveTextarea || !sensitiveSelect) throw new Error('Expected sensitive controls');
  sensitiveTextarea.value = 'current-text-code';
  sensitiveSelect.selectedIndex = 0;

  const { snapshot, warnings } = materializeDocumentLiveState();
  expect(warnings).toEqual([]);

  expect(snapshot.querySelector('input[name="query"]')?.getAttribute('value')).toBe(
    'current query'
  );
  expect(snapshot.querySelector('input[type="password"]')?.hasAttribute('value')).toBe(false);
  expect(
    snapshot
      .querySelector('input[autocomplete="section-login one-time-code webauthn"]')
      ?.hasAttribute('value')
  ).toBe(false);
  expect(snapshot.querySelector('input[type="hidden"]')?.hasAttribute('value')).toBe(false);
  expect(
    snapshot.querySelector('input[autocomplete="billing cc-number"]')?.hasAttribute('value')
  ).toBe(false);
  expect(
    snapshot
      .querySelector('input[type="checkbox"][autocomplete="one-time-code"]')
      ?.hasAttribute('checked')
  ).toBe(false);
  expect(snapshot.querySelector('textarea')?.textContent).toBe('');
  expect(snapshot.querySelector('textarea')?.hasAttribute('value')).toBe(false);
  expect(snapshot.querySelector('select')?.hasAttribute('value')).toBe(false);
  expect(snapshot.querySelector('select option')).toBeNull();
  expect(snapshot.querySelector('select')?.textContent).toBe('');
});

it('retains canvas pixels as an offline image-backed canvas layer', () => {
  document.body.innerHTML = '<canvas width="20" height="10"></canvas>';
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('Expected canvas');
  vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,cG5n');

  const { snapshot, warnings } = materializeDocumentLiveState();
  expect(warnings).toEqual([]);

  const captured = snapshot.querySelector('canvas');
  expect(captured?.getAttribute('data-sniptale-canvas-rasterized')).toBe('true');
  expect(captured?.getAttribute('style')).toContain('data:image/png;base64,cG5n');
});

it('freezes non-zero internal scroll offsets without executable snapshot code', () => {
  document.body.innerHTML = [
    '<aside id="scrolled"><div>Before</div><div>Captured content</div></aside>',
    '<section data-sniptale-scroll-state="page-owned"><p>Ordinary content</p></section>',
  ].join('');
  const source = document.querySelector<HTMLElement>('#scrolled');
  if (!source) throw new Error('Expected scroll container');
  Object.defineProperty(source, 'scrollLeft', { configurable: true, value: 12 });
  Object.defineProperty(source, 'scrollTop', { configurable: true, value: 1259 });
  Object.defineProperty(source, 'clientWidth', { configurable: true, value: 260 });
  Object.defineProperty(source, 'clientHeight', { configurable: true, value: 702 });

  const { snapshot, warnings } = materializeDocumentLiveState();

  expect(warnings).toEqual([]);
  expect(snapshot.querySelector('#scrolled')?.getAttribute('data-sniptale-scroll-state')).toBe(
    'scroll-1'
  );
  expect(snapshot.querySelector('section')?.hasAttribute('data-sniptale-scroll-state')).toBe(false);
  const css = snapshot.ownerDocument.querySelector(
    'style[data-sniptale-captured-scroll-state="true"]'
  )?.textContent;
  expect(css).toContain('overflow:hidden!important');
  expect(css).toContain(
    'box-sizing:border-box!important;width:260px!important;height:702px!important'
  );
  expect(css).toContain('translate:-12px -1259px!important');
  expect(snapshot.ownerDocument.querySelector('script')).toBeNull();
});

it('freezes whether custom elements were defined at capture time', () => {
  const definedName = `snapshot-defined-${crypto.randomUUID()}`;
  const undefinedName = `snapshot-undefined-${crypto.randomUUID()}`;
  customElements.define(definedName, class extends HTMLElement {});
  document.body.innerHTML = [
    '<div data-sniptale-live-state-id="sniptale-live-1"></div>',
    `<${definedName} data-sniptale-custom-element-undefined></${definedName}>`,
    `<${undefinedName}></${undefinedName}>`,
    '<button data-sniptale-custom-element-undefined>Native</button>',
  ].join('');

  const { snapshot, warnings } = materializeDocumentLiveState();
  expect(warnings).toEqual([]);

  expect(
    snapshot.querySelector(definedName)?.hasAttribute('data-sniptale-custom-element-undefined')
  ).toBe(false);
  expect(
    snapshot.querySelector(undefinedName)?.hasAttribute('data-sniptale-custom-element-undefined')
  ).toBe(true);
  expect(
    snapshot.querySelector('button')?.hasAttribute('data-sniptale-custom-element-undefined')
  ).toBe(false);
  expect(
    snapshot
      .querySelector('[data-sniptale-live-state-id]')
      ?.getAttribute('data-sniptale-live-state-id')
  ).toBe('sniptale-live-1');
});

it('materializes state only in an inert document without hostile custom-element reactions', () => {
  const observerName = `snapshot-observer-${crypto.randomUUID()}`;
  const undefinedName = `snapshot-undefined-${crypto.randomUUID()}`;
  const reactions = vi.fn();
  customElements.define(
    observerName,
    class extends HTMLElement {
      static observedAttributes = ['data-sniptale-custom-element-undefined', 'value'];

      attributeChangedCallback() {
        reactions();
        if (this.isConnected) return;
        const root = this.getRootNode() as ParentNode;
        root.querySelector(undefinedName)?.remove();
        root.querySelector('button')?.setAttribute('data-sniptale-custom-element-undefined', '');
      }
    }
  );
  document.body.innerHTML = [
    `<${undefinedName}></${undefinedName}>`,
    `<${observerName} data-sniptale-custom-element-undefined></${observerName}>`,
    '<button>Native</button>',
  ].join('');
  const { snapshot } = materializeDocumentLiveState(() => reactions.mockClear());

  expect(reactions).not.toHaveBeenCalled();
  expect(document.querySelector(undefinedName)).not.toBeNull();
  expect(
    snapshot.querySelector(undefinedName)?.hasAttribute('data-sniptale-custom-element-undefined')
  ).toBe(true);
  expect(
    snapshot.querySelector(observerName)?.hasAttribute('data-sniptale-custom-element-undefined')
  ).toBe(false);
  expect(
    snapshot.querySelector('button')?.hasAttribute('data-sniptale-custom-element-undefined')
  ).toBe(false);
});

it('materializes high-cardinality custom-element state in one virtual-tree traversal', () => {
  document.body.innerHTML = Array.from(
    { length: 2_000 },
    (_, index) => `<snapshot-undefined-${index}></snapshot-undefined-${index}>`
  ).join('');

  const { snapshot, warnings } = materializeDocumentLiveState();

  expect(warnings).toEqual([]);
  expect(snapshot.querySelectorAll('[data-sniptale-custom-element-undefined]')).toHaveLength(2_000);
});
