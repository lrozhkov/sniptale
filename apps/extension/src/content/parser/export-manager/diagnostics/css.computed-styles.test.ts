// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { buildComputedStyleDiagnosticAsset } from './css.computed-styles';

import {
  expectCappedTargetAsset,
  expectVisibleTargetAsset,
  installCappedTargetFixture,
  installVisibleTargetFixture,
  readComputedStyleAsset,
} from './css.computed-styles.test.helpers';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('serializes visible targets with stable paths and filters extension-owned nodes', () => {
  installVisibleTargetFixture();
  const asset = readComputedStyleAsset();

  expectVisibleTargetAsset(asset);
});

it('caps collected targets and normalizes non-finite geometry values', () => {
  installCappedTargetFixture();

  const asset = readComputedStyleAsset();
  expectCappedTargetAsset(asset);
});

it('captures icon pseudo-element content and font evidence without requiring visible text', () => {
  const icon = document.createElement('span');
  icon.className = 'control-icon';
  document.body.append(icon);
  Object.defineProperty(icon, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height: 16, width: 16, x: 1, y: 2 }),
  });
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element, pseudo) =>
      ({
        getPropertyValue(property: string) {
          if (property === 'display') return element === icon ? 'inline-block' : 'none';
          if (property === 'visibility') return 'visible';
          if (property === 'opacity') return '1';
          if (property === 'font-family' && element === icon) return 'Icons';
          if (property === 'content' && element === icon && pseudo === '::before') {
            return '"\\e001"';
          }
          return '';
        },
      }) as CSSStyleDeclaration
  );

  const payload = JSON.parse(String(buildComputedStyleDiagnosticAsset().content)) as {
    targets: Array<{ pseudoElements?: { before?: Record<string, string> } }>;
  };

  expect(payload.targets).toContainEqual(
    expect.objectContaining({
      pseudoElements: { before: { content: '"\\e001"', 'font-family': 'Icons' } },
    })
  );
});

it('records matched stylesheet candidates together with the authoritative computed value', () => {
  document.head.innerHTML = '<style>.diagnostic-rule { color: rgb(12, 34, 56); }</style>';
  const target = document.createElement('button');
  target.className = 'diagnostic-rule';
  document.body.append(target);
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height: 20, width: 80, x: 0, y: 0 }),
  });

  const payload = JSON.parse(String(buildComputedStyleDiagnosticAsset().content)) as {
    targets: Array<{ matchedRules?: Array<{ selector: string }> }>;
  };

  expect(
    payload.targets.some((entry) =>
      entry.matchedRules?.some((rule) => rule.selector === '.diagnostic-rule')
    )
  ).toBe(true);
});

it('sanitizes computed, pseudo, and matched rule evidence before serialization', () => {
  document.head.innerHTML = [
    '<style>',
    '.token-secret {' +
      ' background-image: url("https://user:password@example.test/a.svg?token=private");' +
      ' mask-image: url("data:image/svg+xml,private-body");' +
      '}',
    '</style>',
  ].join('');
  const target = document.createElement('button');
  target.className = 'token-secret';
  document.body.append(target);
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height: 20, width: 80, x: 0, y: 0 }),
  });
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = document.createElement('span').style;
    style.setProperty('display', element === target ? 'block' : 'none');
    style.setProperty('visibility', 'visible');
    style.setProperty('opacity', '1');
    if (element === target) {
      style.setProperty(
        'background-image',
        'url("https://user:password@example.test/a.svg?token=private")'
      );
    }
    if (element === target && pseudo === '::before') {
      style.setProperty('content', '"private customer name"');
    }
    return style;
  });

  const content = String(buildComputedStyleDiagnosticAsset().content);

  expect(content).toContain('https://example.test/a.svg');
  expect(content).toContain('[embedded image/svg+xml]');
  expect(content).toContain('[text content redacted: 23 chars]');
  expect(content).not.toContain('private-body');
  expect(content).not.toContain('password');
  expect(content).not.toContain('token=private');
  expect(content).not.toContain('private customer name');
});
