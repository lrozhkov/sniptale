// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../platform/dom-host';
import {
  applyFloatingPolicyForTile,
  collectFloatingCandidates,
  commitFloatingTile,
  preparePageMutations,
  restorePageMutations,
  setOwnedStyle,
} from './mutations';
import type { FullPageAgentSession, FloatingCandidate } from './types';

function rect(values: Partial<DOMRect>): DOMRect {
  const result = {
    bottom: 100,
    height: 100,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...values,
  };
  return result as DOMRect;
}

function createSession(
  floating: FloatingCandidate[],
  floatingElements: 'hide' | 'once' | 'repeat' = 'once'
): FullPageAgentSession {
  return {
    abortController: new AbortController(),
    classMutations: [],
    floating,
    frozenExtentWarning: false,
    geometry: {
      devicePixelRatio: 1,
      extentHeight: 1_200,
      extentWidth: 800,
      outputHeight: 1_200,
      outputWidth: 800,
      rootKind: 'document',
      rootViewport: { height: 600, width: 800, x: 0, y: 0 },
      viewportHeight: 600,
      viewportWidth: 800,
    },
    hadScrollbarClass: false,
    identity: { jobId: 'job-1', ownerToken: 'owner-1', runtimeGeneration: 'generation-1' },
    layoutGeneration: 'layout-1',
    mutations: [],
    originalScroll: { x: 17, y: 29 },
    preferences: { floatingElements, freezeMotion: false, preloadLazyContent: false },
    root: { element: document.documentElement, kind: 'document' },
    restored: false,
    styleElement: null,
    videos: [],
    warnings: [],
    watchdog: null,
  };
}

function documentRoot() {
  return { element: document.documentElement, kind: 'document' as const };
}

function mountContentHost(): { host: HTMLDivElement; shadowRoot: ShadowRoot } {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  document.body.append(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  initializeContentUiRoots(shadowRoot);
  return { host, shadowRoot };
}

function createCandidate(
  element: HTMLElement,
  overrides: Partial<FloatingCandidate> = {}
): FloatingCandidate {
  return {
    anchor: { bottom: false, center: false, left: false, right: false, top: true },
    appliedVisibility: null,
    element,
    pendingShown: false,
    position: 'fixed',
    priorVisibility: element.style.getPropertyValue('visibility'),
    priorVisibilityPriority: element.style.getPropertyPriority('visibility'),
    shellOnly: false,
    shown: false,
    ...overrides,
  };
}

beforeEach(() => {
  Object.defineProperties(window, {
    innerHeight: { configurable: true, value: 600 },
    innerWidth: { configurable: true, value: 800 },
  });
});

afterEach(() => {
  document.body.replaceChildren();
  document.body.removeAttribute('class');
  document.body.removeAttribute('style');
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('style');
  vi.restoreAllMocks();
});

it('classifies fixed and sticky candidates while excluding a passive full-viewport background', () => {
  const fixed = document.createElement('header');
  fixed.style.position = 'fixed';
  vi.spyOn(fixed, 'getBoundingClientRect').mockReturnValue(rect({ right: 800, width: 800 }));
  const sticky = document.createElement('aside');
  sticky.style.position = 'sticky';
  vi.spyOn(sticky, 'getBoundingClientRect').mockReturnValue(
    rect({ bottom: 600, height: 600, left: 0, right: 100, width: 100 })
  );
  const background = document.createElement('div');
  background.style.pointerEvents = 'none';
  background.style.position = 'fixed';
  vi.spyOn(background, 'getBoundingClientRect').mockReturnValue(
    rect({ bottom: 600, height: 600, right: 800, width: 800 })
  );
  document.body.append(fixed, sticky, background);

  expect(collectFloatingCandidates(documentRoot()).map(({ element }) => element)).toEqual([
    fixed,
    sticky,
  ]);
});

it('keeps captured annotations visible while hiding only transient extension chrome', () => {
  document.documentElement.classList.add('sniptale-full-page-scrollbar-hidden');
  const pageContent = document.createElement('main');
  pageContent.className = 'sniptale-page-owned-class';
  document.body.append(pageContent);
  const { host: ownedRoot, shadowRoot } = mountContentHost();
  const annotation = document.createElement('div');
  annotation.className = 'sniptale-callout';
  const transientToolbar = document.createElement('div');
  transientToolbar.className = 'sniptale-action-toolbar';
  shadowRoot.append(annotation, transientToolbar);
  const session = createSession([]);

  preparePageMutations(session);

  expect(document.documentElement.style.getPropertyValue('visibility')).toBe('');
  expect(document.body.style.getPropertyValue('visibility')).toBe('');
  expect(pageContent.style.getPropertyValue('visibility')).toBe('');
  expect(ownedRoot.style.getPropertyValue('visibility')).toBe('');
  expect(annotation.style.getPropertyValue('visibility')).toBe('');
  expect(transientToolbar.style.getPropertyValue('visibility')).toBe('');
  expect(document.body.classList.contains('sniptale-capture-ui-hidden')).toBe(true);
  expect(ownedRoot.classList.contains('sniptale-capture-ui-hidden')).toBe(true);

  restorePageMutations(session);
  expect(document.body.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
  expect(ownedRoot.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
});

it('keeps earlier same-id page UI actionable while hiding only the exact content host', () => {
  const pageLookalike = document.createElement('div');
  pageLookalike.id = CONTENT_ROOT_ID;
  pageLookalike.style.position = 'fixed';
  const pageAction = document.createElement('button');
  pageAction.style.position = 'fixed';
  pageLookalike.append(pageAction);
  document.body.append(pageLookalike);
  vi.spyOn(pageLookalike, 'getBoundingClientRect').mockReturnValue(rect({}));
  vi.spyOn(pageAction, 'getBoundingClientRect').mockReturnValue(rect({}));

  const { host, shadowRoot } = mountContentHost();
  host.style.position = 'fixed';
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(rect({}));
  const recoveryUi = document.createElement('div');
  recoveryUi.setAttribute('data-floating-ui-capture-transient', 'true');
  recoveryUi.style.position = 'fixed';
  shadowRoot.append(recoveryUi);
  vi.spyOn(recoveryUi, 'getBoundingClientRect').mockReturnValue(rect({}));

  const candidates = collectFloatingCandidates(documentRoot()).map(({ element }) => element);
  expect(candidates).toEqual([pageLookalike, pageAction]);

  const session = createSession([]);
  preparePageMutations(session);

  expect(pageLookalike.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
  expect(host.classList.contains('sniptale-capture-ui-hidden')).toBe(true);
  expect(recoveryUi.getRootNode()).toBe(shadowRoot);
  expect(candidates).not.toContain(recoveryUi);

  restorePageMutations(session);
  expect(host.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
});

it('preserves capture-hidden classes owned by the surrounding screenshot lifecycle', () => {
  const { host: ownedRoot } = mountContentHost();
  document.body.classList.add('sniptale-capture-ui-hidden');
  ownedRoot.classList.add('sniptale-capture-ui-hidden');
  const session = createSession([]);

  preparePageMutations(session);
  restorePageMutations(session);

  expect(document.body.classList.contains('sniptale-capture-ui-hidden')).toBe(true);
  expect(ownedRoot.classList.contains('sniptale-capture-ui-hidden')).toBe(true);
});

it('keeps a fixed selected scroller and its fixed shell out of floating suppression', () => {
  const shell = document.createElement('section');
  shell.style.position = 'fixed';
  const scroller = document.createElement('main');
  scroller.style.position = 'fixed';
  const overlay = document.createElement('header');
  overlay.style.position = 'fixed';
  shell.append(scroller);
  document.body.append(shell, overlay);
  vi.spyOn(shell, 'getBoundingClientRect').mockReturnValue(rect({ right: 800, width: 800 }));
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(rect({ right: 800, width: 800 }));
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue(rect({ right: 800, width: 800 }));

  const candidates = collectFloatingCandidates({ element: scroller, kind: 'element' });

  expect(candidates.map(({ element }) => element)).toEqual([overlay]);
});

it('captures a fixed element wholly outside an internal scroller with the one shell frame', () => {
  const scroller = document.createElement('main');
  const footer = document.createElement('footer');
  scroller.style.overflow = 'auto';
  footer.style.position = 'fixed';
  document.body.append(scroller, footer);
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(
    rect({ bottom: 500, height: 400, left: 50, right: 750, top: 100, width: 700 })
  );
  vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue(
    rect({ bottom: 600, height: 80, left: 0, right: 800, top: 520, width: 800 })
  );
  const [candidate] = collectFloatingCandidates({ element: scroller, kind: 'element' });
  expect(candidate?.shellOnly).toBe(true);
  const session = createSession(candidate ? [candidate] : []);
  session.root = { element: scroller, kind: 'element' };
  session.geometry = {
    ...session.geometry,
    extentHeight: 1_200,
    rootKind: 'element',
    rootViewport: { height: 400, width: 700, x: 50, y: 100 },
  };

  applyFloatingPolicyForTile(session, {
    firstColumn: true,
    firstRow: true,
    lastColumn: true,
    lastRow: false,
  });
  expect(footer.style.getPropertyValue('visibility')).toBe('visible');

  applyFloatingPolicyForTile(session, {
    firstColumn: true,
    firstRow: false,
    lastColumn: true,
    lastRow: true,
  });
  expect(footer.style.getPropertyValue('visibility')).toBe('hidden');
});

it('always installs capture chrome while freezing motion only when requested', () => {
  const session = createSession([]);

  preparePageMutations(session);

  expect(session.styleElement?.textContent).toContain('::-webkit-scrollbar');
  expect(session.styleElement?.textContent).not.toContain('animation-play-state');
  restorePageMutations(session);
  expect(session.styleElement?.isConnected).toBe(false);
});

it('shows a top fixed candidate only in the first row for once mode', () => {
  const element = document.createElement('header');
  const session = createSession([createCandidate(element)]);

  applyFloatingPolicyForTile(session, {
    firstColumn: true,
    firstRow: true,
    lastColumn: true,
    lastRow: false,
  });
  expect(element.style.getPropertyValue('visibility')).toBe('visible');

  applyFloatingPolicyForTile(session, {
    firstColumn: true,
    firstRow: false,
    lastColumn: true,
    lastRow: true,
  });
  expect(element.style.getPropertyValue('visibility')).toBe('hidden');
});

it.each([
  ['hide', 'hidden'],
  ['repeat', 'visible'],
] as const)('applies %s mode deterministically', (mode, expected) => {
  const element = document.createElement('div');
  const session = createSession([createCandidate(element)], mode);

  applyFloatingPolicyForTile(session, {
    firstColumn: false,
    firstRow: false,
    lastColumn: false,
    lastRow: false,
  });

  expect(element.style.getPropertyValue('visibility')).toBe(expected);
});

it('shows a sticky candidate once when it first intersects the frozen root viewport', () => {
  const element = document.createElement('div');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect({ top: 200, bottom: 260 }));
  const candidate = createCandidate(element, { position: 'sticky' });
  const session = createSession([candidate]);
  const tile = { firstColumn: true, firstRow: false, lastColumn: true, lastRow: false };

  applyFloatingPolicyForTile(session, tile);
  expect(element.style.getPropertyValue('visibility')).toBe('visible');
  commitFloatingTile(session);
  applyFloatingPolicyForTile(session, tile);

  expect(candidate.shown).toBe(true);
  expect(element.style.getPropertyValue('visibility')).toBe('hidden');
});

it('restores only style values still owned by the agent', () => {
  const element = document.createElement('div');
  element.style.setProperty('overflow-anchor', 'auto');
  const session = createSession([]);
  setOwnedStyle(session.mutations, element, 'overflow-anchor', 'none', 'important');
  element.style.setProperty('overflow-anchor', 'initial');

  restorePageMutations(session);

  expect(element.style.getPropertyValue('overflow-anchor')).toBe('initial');
});

it('restores original scroll-affecting inline styles after preparation', () => {
  document.documentElement.style.setProperty('scroll-behavior', 'smooth');
  const session = createSession([]);

  preparePageMutations(session);
  expect(document.documentElement.style.getPropertyValue('scroll-behavior')).toBe('auto');
  restorePageMutations(session);

  expect(document.documentElement.style.getPropertyValue('scroll-behavior')).toBe('smooth');
  expect(document.documentElement.classList.contains('sniptale-full-page-scrollbar-hidden')).toBe(
    false
  );
});
