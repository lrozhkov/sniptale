// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  browserAnnotationSession,
  type BrowserAnnotationTargetEvidence,
} from '../../parser/page-preparation/annotations';
import {
  initializeContentUiRoots,
  isContentOwnedPassiveChrome,
  PASSIVE_CONTENT_CHROME,
} from '../../platform/dom-host';
import { BrowserAnnotationMarkers } from './view';

let host: HTMLDivElement;
let root: Root;
let animationFrameCallbacks: Map<number, FrameRequestCallback>;
let nextAnimationFrameId: number;

const designTokensStylesheet = readFileSync('packages/ui/src/styles/design-tokens.css', 'utf8');

function readHexTokenValues(token: string): string[] {
  const prefix = `${token}:`;
  return designTokensStylesheet.split('\n').flatMap((line) => {
    const declaration = line.trim();
    if (!declaration.startsWith(prefix)) {
      return [];
    }
    const value = declaration.slice(prefix.length).trim().replace(/;$/, '');
    return /^#[0-9a-f]{6}$/i.test(value) ? [value] : [];
  });
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(left: string, right: string): number {
  const [lighter, darker] = [relativeLuminance(left), relativeLuminance(right)].sort(
    (first, second) => second - first
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

function createEvidence(selector: string): BrowserAnnotationTargetEvidence {
  return {
    fileLabel: selector,
    frame: { kind: 'top-document' },
    locator: selector,
    nodePosition: { x: 10, y: 20 },
    pageUrl: 'https://example.test',
    targetPath: selector,
    targetSelector: selector,
    targetText: selector,
    viewport: { height: 720, width: 1280 },
  };
}

function appendVisible<T extends Element>(
  target: T,
  rect: { height?: number; left?: number; top?: number; width?: number } = {},
  parent: ParentNode = document.body
): T {
  setVisibleRect(target, rect);
  parent.append(target);
  return target;
}

function setVisibleRect(
  target: Element,
  rect: { height?: number; left?: number; top?: number; width?: number }
): void {
  const targetRect = DOMRect.fromRect({
    height: rect.height ?? 40,
    width: rect.width ?? 80,
    x: rect.left ?? 30,
    y: rect.top ?? 50,
  });
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => targetRect,
  });
  Object.defineProperty(target, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: targetRect,
      [Symbol.iterator]: () => [targetRect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? targetRect : null),
      length: 1,
    }),
  });
}

function addComment(target: Element, comment: string, selector: string): void {
  browserAnnotationSession.setComment({ comment, evidence: createEvidence(selector), target });
}

async function renderMarkers(): Promise<void> {
  await act(async () => {
    root.render(<BrowserAnnotationMarkers />);
  });
}

function runAnimationFrame(): void {
  const callbacks = Array.from(animationFrameCallbacks.entries());
  callbacks.forEach(([id]) => animationFrameCallbacks.delete(id));
  act(() => callbacks.forEach(([, callback]) => callback(performance.now())));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerHeight', 720);
  vi.stubGlobal('innerWidth', 1280);
  animationFrameCallbacks = new Map();
  nextAnimationFrameId = 1;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId;
      nextAnimationFrameId += 1;
      animationFrameCallbacks.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      animationFrameCallbacks.delete(id);
    })
  );
  browserAnnotationSession.resetForDocument();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('projects numbered accessible markers for HTML, SVG, iframe-inner, and iframe targets', async () => {
  const html = appendVisible(document.createElement('section'));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.append(svg);
  const svgText = appendVisible(
    document.createElementNS('http://www.w3.org/2000/svg', 'text'),
    { left: 120 },
    svg
  );
  const iframe = appendVisible(document.createElement('iframe'), { left: 220, width: 240 });
  Object.defineProperty(iframe, 'clientLeft', { configurable: true, value: 10 });
  Object.defineProperty(iframe, 'clientTop', { configurable: true, value: 6 });
  const iframeTarget = appendVisible(
    iframe.contentDocument!.createElement('button'),
    { left: 10, top: 15 },
    iframe.contentDocument!.body
  );
  const opaqueIframe = appendVisible(document.createElement('iframe'), { left: 520 });

  addComment(html, 'HTML comment', '#html');
  addComment(svgText, 'SVG comment', '#svg');
  addComment(iframeTarget, 'Inner comment', 'iframe => #inner');
  addComment(opaqueIframe, 'Iframe comment', '#opaque');
  await renderMarkers();

  const markers = Array.from(
    document.querySelectorAll<HTMLElement>('[data-ui="content.annotation-marker"] [role="note"]')
  );
  expect(markers.map((marker) => marker.textContent)).toEqual(['1', '2', '3', '4']);
  const firstTooltip = document.getElementById(markers[0]!.getAttribute('aria-describedby')!);
  expect(markers[0]?.getAttribute('aria-label')).toBe('Комментарий 1');
  const iframeInnerMarker = document.querySelector<HTMLElement>('[data-annotation-id="3"]');
  expect(iframeInnerMarker?.style.left).toBe('308px');
  expect(iframeInnerMarker?.style.top).toBe('59px');
  expect(firstTooltip?.getAttribute('role')).toBe('tooltip');
  expect(firstTooltip?.textContent).toBe('HTML comment');
  expect(firstTooltip?.className).toContain('group-hover:visible');
  expect(firstTooltip?.className).toContain('group-focus-within:visible');
  const markerLayer = document.querySelector('[data-ui="content.annotation-markers"]');
  const firstMarkerGroup = document.querySelector('[data-ui="content.annotation-marker"]');
  for (const [name, value] of Object.entries(PASSIVE_CONTENT_CHROME)) {
    expect(markerLayer?.getAttribute(name)).toBe(value);
    expect(firstMarkerGroup?.getAttribute(name)).toBe(value);
    expect(markers[0]?.getAttribute(name)).toBe(value);
    expect(firstTooltip?.getAttribute(name)).toBeNull();
  }
  markers[0]?.focus();
  expect(document.activeElement).toBe(markers[0]);
  expect(html.children).toHaveLength(0);
  expect(svgText.children).toHaveLength(0);
  expect(opaqueIframe.children).toHaveLength(0);
});

it('registers marker projection and note as passive while keeping its tooltip interactive', async () => {
  act(() => root.unmount());
  const contentHost = document.createElement('div');
  document.body.append(contentHost);
  const shadowRoot = contentHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(shadowRoot);
  host = document.createElement('div');
  shadowRoot.append(host);
  root = createRoot(host);
  const target = appendVisible(document.createElement('div'));
  addComment(target, 'Registered marker', '#registered');

  await renderMarkers();

  const markerLayer = shadowRoot.querySelector('[data-ui="content.annotation-markers"]');
  const markerGroup = shadowRoot.querySelector('[data-ui="content.annotation-marker"]');
  const markerNote = shadowRoot.querySelector('[role="note"]');
  const tooltip = shadowRoot.querySelector('[role="tooltip"]');
  expect(isContentOwnedPassiveChrome(markerLayer)).toBe(true);
  expect(isContentOwnedPassiveChrome(markerGroup)).toBe(true);
  expect(isContentOwnedPassiveChrome(markerNote)).toBe(true);
  expect(isContentOwnedPassiveChrome(tooltip)).toBe(false);
  expect(markerNote?.querySelector('svg')?.getAttribute('class')).toContain('pointer-events-none');
  expect(markerNote?.querySelector(':scope > span')?.getAttribute('class')).toContain(
    'pointer-events-none'
  );
});

it('keeps text and internal focus geometry above theme contrast on an accent host', async () => {
  document.body.style.backgroundColor = '#f97316';
  const target = appendVisible(document.createElement('div'));
  addComment(target, 'Contrast', '#contrast');
  await renderMarkers();

  const marker = document.querySelector<HTMLElement>(
    '[data-ui="content.annotation-marker"] [role="note"]'
  );
  expect(marker?.className).toContain('bg-[var(--sniptale-color-surface-canvas)]');
  expect(marker?.className).toContain('text-[var(--sniptale-color-text-primary)]');
  expect(marker?.className).toContain('border-[color:var(--sniptale-color-surface-canvas)]');
  expect(marker?.style.borderWidth).toBe('3px');
  expect(marker?.className).toContain('focus-visible:border-[color:var(--sniptale-color-accent)]');
  expect(marker?.className).not.toContain('focus-visible:border-[3px]');
  expect(marker?.className).not.toContain('focus-visible:outline');
  act(() => marker?.focus());
  expect(document.activeElement).toBe(marker);

  const backgrounds = readHexTokenValues('--sniptale-color-surface-canvas');
  const foregrounds = readHexTokenValues('--sniptale-color-text-primary');
  const focusColors = readHexTokenValues('--sniptale-color-accent');
  expect(backgrounds).toHaveLength(2);
  backgrounds.forEach((background, index) => {
    expect(contrastRatio(foregrounds[index]!, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(focusColors[index]!, background)).toBeGreaterThanOrEqual(3);
  });
});

it('tracks position-only movement without session or resize events', async () => {
  const target = appendVisible(document.createElement('div'), { left: 30, top: 50, width: 80 });
  addComment(target, 'Move me', '#moving');
  await renderMarkers();

  const marker = document.querySelector<HTMLElement>('[data-ui="content.annotation-marker"]');
  expect(marker?.style.left).toBe('98px');
  expect(marker?.style.top).toBe('38px');

  setVisibleRect(target, { left: 330, top: 250, width: 80 });
  runAnimationFrame();

  expect(marker?.style.left).toBe('398px');
  expect(marker?.style.top).toBe('238px');
});

it('recomputes tooltip side and bounds after viewport-only size changes', async () => {
  const target = appendVisible(document.createElement('div'), {
    left: 82,
    top: 112,
    width: 80,
  });
  addComment(target, 'Viewport placement', '#viewport');
  await renderMarkers();

  const marker = document.querySelector<HTMLElement>('[data-ui="content.annotation-marker"]');
  const tooltipId = marker?.querySelector('[role="note"]')?.getAttribute('aria-describedby');
  let tooltip = tooltipId ? document.getElementById(tooltipId) : null;
  expect(marker?.style.left).toBe('150px');
  expect(marker?.style.right).toBe('');
  expect(marker?.style.top).toBe('100px');
  expect(tooltip?.style.left).toBe('150px');
  expect(tooltip?.style.top).toBe('140px');
  expect(tooltip?.className).toContain('before:-top-2');

  vi.stubGlobal('innerWidth', 200);
  vi.stubGlobal('innerHeight', 150);
  runAnimationFrame();

  tooltip = tooltipId ? document.getElementById(tooltipId) : null;
  const tooltipScroll = tooltip?.querySelector<HTMLElement>(
    '[data-ui="content.annotation-marker-tooltip-scroll"]'
  );
  expect(marker?.style.left).toBe('');
  expect(marker?.style.right).toBe('50px');
  expect(marker?.style.top).toBe('100px');
  expect(tooltip?.style.right).toBe('50px');
  expect(tooltip?.style.bottom).toBe('58px');
  expect(tooltip?.className).toContain('before:-bottom-2');
  expect(tooltip?.className).not.toContain('overflow-y-auto');
  expect(tooltipScroll?.style.maxWidth).toBe('146px');
  expect(tooltipScroll?.style.maxHeight).toBe('88px');
  expect(tooltipScroll?.className).toContain('overflow-y-auto');
});

it('uses a chrome-aware full-viewport fallback for a height-80 viewport', async () => {
  const target = appendVisible(document.createElement('div'), { left: 32, top: 38 });
  addComment(target, 'Small viewport', '#small');
  await renderMarkers();
  const marker = document.querySelector<HTMLElement>('[data-ui="content.annotation-marker"]');
  const tooltipId = marker?.querySelector('[role="note"]')?.getAttribute('aria-describedby');

  vi.stubGlobal('innerHeight', 80);
  runAnimationFrame();

  const tooltip = tooltipId ? document.getElementById(tooltipId) : null;
  const tooltipScroll = tooltip?.querySelector<HTMLElement>(
    '[data-ui="content.annotation-marker-tooltip-scroll"]'
  );
  expect(marker?.style.top).toBe('26px');
  expect(tooltip?.style.top).toBe('4px');
  expect(tooltip?.style.bottom).toBe('');
  expect(tooltipScroll?.style.maxHeight).toBe('72px');
  expect(tooltipScroll?.className).toContain('p-0.5');
  expect(tooltip?.className).not.toContain('before:-top-2');
  expect(tooltip?.className).not.toContain('before:-bottom-2');
  expect(
    Number.parseFloat(tooltip!.style.top) + Number.parseFloat(tooltipScroll!.style.maxHeight)
  ).toBe(76);
});

it('anchors a variable-width focused marker inside the right viewport edge', async () => {
  const snapshot = browserAnnotationSession.captureSnapshot();
  browserAnnotationSession.applySnapshot({ ...snapshot, nextCommentMarker: 12_345 });
  document.body.style.backgroundColor = '#f97316';
  const target = appendVisible(document.createElement('div'), { left: 1200, width: 80 });
  addComment(target, 'Right edge', '#right-edge');
  await renderMarkers();

  const group = document.querySelector<HTMLElement>('[data-ui="content.annotation-marker"]');
  const marker = group?.querySelector<HTMLElement>('[role="note"]');
  expect(marker?.textContent).toBe('12345');
  expect(group?.style.left).toBe('');
  expect(group?.style.right).toBe('12px');
  expect(marker?.className).toContain('max-w-[calc(100vw-8px)]');
  expect(marker?.style.borderWidth).toBe('3px');
  act(() => marker?.focus());
  expect(group?.style.right).toBe('12px');
  expect(marker?.style.borderWidth).toBe('3px');
});

it('keeps long tooltip content pointer- and keyboard-scrollable from the focused marker', async () => {
  const target = appendVisible(document.createElement('div'));
  addComment(target, 'Long '.repeat(200), '#long');
  await renderMarkers();
  const marker = document.querySelector<HTMLElement>('[role="note"]');
  const tooltip = document.getElementById(marker!.getAttribute('aria-describedby')!);
  const tooltipScroll = tooltip?.querySelector<HTMLElement>(
    '[data-ui="content.annotation-marker-tooltip-scroll"]'
  );
  Object.defineProperty(tooltipScroll, 'clientHeight', { configurable: true, value: 40 });
  Object.defineProperty(tooltipScroll, 'scrollHeight', { configurable: true, value: 200 });
  expect(tooltip?.className).toContain('pointer-events-auto');
  expect(tooltip?.className).not.toContain('overflow-y-auto');
  expect(tooltipScroll?.className).toContain('overflow-y-auto');

  act(() => {
    marker?.focus();
    marker?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
  });
  expect(tooltipScroll?.scrollTop).toBe(24);
  act(() => marker?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' })));
  expect(tooltipScroll?.scrollTop).toBe(160);
  act(() => marker?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' })));
  expect(tooltipScroll?.scrollTop).toBe(0);
  expect(document.activeElement).toBe(marker);
});

it('scrolls through a component-local tooltip ref when mounted inside a ShadowRoot', async () => {
  act(() => root.unmount());
  const shadowHost = document.createElement('div');
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  document.body.append(shadowHost);
  host = shadowHost;
  root = createRoot(shadowRoot);
  const target = appendVisible(document.createElement('div'));
  addComment(target, 'Shadow '.repeat(200), '#shadow-scroll');
  await renderMarkers();

  const marker = shadowRoot.querySelector<HTMLElement>('[role="note"]');
  const tooltip = shadowRoot.getElementById(marker!.getAttribute('aria-describedby')!);
  const tooltipScroll = tooltip?.querySelector<HTMLElement>(
    '[data-ui="content.annotation-marker-tooltip-scroll"]'
  );
  Object.defineProperty(tooltipScroll, 'clientHeight', { configurable: true, value: 40 });
  Object.defineProperty(tooltipScroll, 'scrollHeight', { configurable: true, value: 200 });

  act(() => {
    marker?.focus();
    marker?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'PageDown' }));
  });

  expect(tooltipScroll?.scrollTop).toBe(24);
  expect(shadowRoot.activeElement).toBe(marker);
  expect(document.activeElement).toBe(shadowHost);
});

it('publishes the initial live marker during the pre-paint layout commit', () => {
  const target = appendVisible(document.createElement('div'));
  addComment(target, 'First commit', '#first-commit');
  let markerDuringLayoutCommit: Element | null = null;

  act(() => {
    flushSync(() => root.render(<BrowserAnnotationMarkers />));
    markerDuringLayoutCommit = document.querySelector('[data-ui="content.annotation-marker"]');
  });

  expect(markerDuringLayoutCommit).not.toBeNull();
});

it('owns layout work only while at least one live marker exists', async () => {
  await renderMarkers();
  expect(animationFrameCallbacks.size).toBe(0);
  expect(requestAnimationFrame).not.toHaveBeenCalled();

  const target = appendVisible(document.createElement('div'));
  act(() => addComment(target, 'Observe me', '#observed'));
  expect(animationFrameCallbacks.size).toBe(1);
  expect(requestAnimationFrame).toHaveBeenCalledOnce();

  act(() =>
    browserAnnotationSession.setComment({
      comment: '',
      evidence: createEvidence('#observed'),
      target,
    })
  );
  expect(animationFrameCallbacks.size).toBe(0);
  expect(cancelAnimationFrame).toHaveBeenCalledOnce();
});

it('removes marker projection on session reset', async () => {
  const target = appendVisible(document.createElement('div'));
  addComment(target, 'Reset me', '#reset');
  await renderMarkers();
  expect(document.querySelector('[data-ui="content.annotation-marker"]')).not.toBeNull();

  act(() => browserAnnotationSession.resetForDocument());

  expect(document.querySelector('[data-ui="content.annotation-marker"]')).toBeNull();
});

it('omits a disconnected target and never rebinds its marker to an SPA replacement selector', async () => {
  const original = appendVisible(document.createElement('div'));
  original.id = 'same';
  addComment(original, 'Original only', '#same');
  await renderMarkers();

  const replacement = appendVisible(document.createElement('div'));
  replacement.id = 'same';
  original.replaceWith(replacement);
  runAnimationFrame();

  expect(document.querySelector('[data-ui="content.annotation-marker"]')).toBeNull();
  expect(browserAnnotationSession.getAnnotationId(replacement)).toBeNull();
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.comment).toBe('Original only');
});

it('removes only the comment marker while preserving other evidence for the live target', async () => {
  const target = appendVisible(document.createElement('div'));
  const evidence = createEvidence('#mixed');
  browserAnnotationSession.recordTextChange({
    after: 'After',
    before: 'Before',
    evidence,
    target,
  });
  browserAnnotationSession.setComment({ comment: 'Comment', evidence, target });
  await renderMarkers();
  expect(document.querySelector('[data-ui="content.annotation-marker"]')).not.toBeNull();

  act(() => {
    browserAnnotationSession.setComment({ comment: '', evidence, target });
  });

  expect(document.querySelector('[data-ui="content.annotation-marker"]')).toBeNull();
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange).toEqual({
    after: 'After',
    before: 'Before',
  });
});
