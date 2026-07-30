// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  listPageStyleRestoreRules: vi.fn(),
  listPageStyleTemplates: vi.fn(),
  summarizePageStyleRulesForPage: vi.fn(),
}));

const frameMocks = vi.hoisted(() => ({
  isIframeAccessible: vi.fn(() => true),
}));

const trustedEventMocks = vi.hoisted(() => ({
  hasActiveUserActivation: vi.fn(() => true),
  isTrustedDomEvent: vi.fn(() => true),
  isTrustedMouseEvent: vi.fn(() => true),
}));

vi.mock('../../../../composition/persistence/page-style/storage', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/page-style/storage')
  >()),
  listPageStyleRestoreRules: storageMocks.listPageStyleRestoreRules,
  listPageStyleTemplates: storageMocks.listPageStyleTemplates,
  summarizePageStyleRulesForPage: storageMocks.summarizePageStyleRulesForPage,
}));

vi.mock('../runtime/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/actions')>()),
  readCurrentPageStyleIdentity: vi.fn(() => ({
    pageDomain: window.location.hostname || null,
    pageUrl: window.location.href,
  })),
}));

vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  hasActiveUserActivation: trustedEventMocks.hasActiveUserActivation,
  isTrustedDomEvent: trustedEventMocks.isTrustedDomEvent,
  isTrustedMouseEvent: trustedEventMocks.isTrustedMouseEvent,
}));

vi.mock('../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/frame')>()),
  isIframeAccessible: frameMocks.isIframeAccessible,
}));

import { usePageStyleInspectorController } from './controller';
import { readPageStyleSelectionSnapshot } from '../runtime/properties';
import { BrowserAnnotationMarkers } from '../../annotation-markers/view';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import {
  initializeContentUiRoots,
  isContentOwnedPassiveChrome,
  PASSIVE_CONTENT_CHROME,
  registerContentOwnedPassiveChrome,
} from '../../../platform/dom-host';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: ReturnType<typeof usePageStyleInspectorController> | null = null;

function Harness() {
  latest = usePageStyleInspectorController({
    quickEditDocumentMode: false,
    quickEditMode: true,
  });
  return <BrowserAnnotationMarkers />;
}

async function renderHarness(parent: HTMLElement | ShadowRoot = document.body) {
  host = document.createElement('div');
  parent.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(<Harness />);
  });
}

async function openInspector() {
  await act(async () => {
    latest?.toggleInspector();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  browserAnnotationSession.resetForDocument();
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue({
    0: DOMRect.fromRect({ height: 40, width: 80 }),
    [Symbol.iterator]: () => [DOMRect.fromRect({ height: 40, width: 80 })][Symbol.iterator](),
    item: (index: number) => (index === 0 ? DOMRect.fromRect({ height: 40, width: 80 }) : null),
    length: 1,
  });
  trustedEventMocks.hasActiveUserActivation.mockReturnValue(true);
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedMouseEvent.mockReturnValue(true);
  frameMocks.isIframeAccessible.mockReturnValue(true);
  storageMocks.listPageStyleTemplates.mockResolvedValue([]);
  storageMocks.listPageStyleRestoreRules.mockResolvedValue([]);
  storageMocks.summarizePageStyleRulesForPage.mockResolvedValue({
    activeAppliedCount: 0,
    matchedRules: [],
    pageUrl: window.location.href,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  latest = null;
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('ignores page-dispatched inspector open and synthetic selection clicks', async () => {
  await renderHarness();
  const target = document.createElement('p');
  target.id = 'synthetic-target';
  target.textContent = 'Synthetic target';
  target.style.color = 'rgb(17, 17, 17)';
  document.body.append(target);

  await act(async () => {
    window.dispatchEvent(
      new CustomEvent('sniptale-page-style-inspector-open', {
        detail: { targetTab: 'properties' },
      })
    );
  });

  expect(latest?.inspectorOpen).toBe(false);

  await openInspector();
  trustedEventMocks.isTrustedMouseEvent.mockReturnValue(false);
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  expect(latest?.viewState.selection).toBeNull();
});

it('selects through passive marker chrome without passing through an owned control', async () => {
  const contentHost = document.createElement('div');
  document.body.append(contentHost);
  const shadowRoot = contentHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(shadowRoot);
  const passiveChrome = document.createElement('div');
  const inspectorControl = document.createElement('button');
  Object.entries(PASSIVE_CONTENT_CHROME).forEach(([name, value]) => {
    inspectorControl.setAttribute(name, value);
  });
  shadowRoot.append(passiveChrome, inspectorControl);
  const unregisterPassiveChrome = registerContentOwnedPassiveChrome(passiveChrome);
  const pageTarget = document.createElement('section');
  const annotatedPageTarget = document.createElement('aside');
  const pageBehindControl = document.createElement('article');
  document.body.append(pageTarget, annotatedPageTarget, pageBehindControl);
  browserAnnotationSession.setComment({
    comment: 'Installed annotation',
    evidence: {
      fileLabel: 'browser:annotated',
      frame: { kind: 'top-document' },
      locator: 'aside',
      nodePosition: { x: 20, y: 30 },
      pageUrl: 'https://example.test',
      targetPath: 'body > aside',
      targetSelector: 'aside',
      targetText: 'Annotated target',
      viewport: { height: 720, width: 1280 },
    },
    target: annotatedPageTarget,
  });
  await renderHarness(shadowRoot);
  await openInspector();
  const markerNote = shadowRoot.querySelector<HTMLElement>('[role="note"]');
  const markerIcon = markerNote?.querySelector('svg');
  const markerNumber = markerNote?.querySelector(':scope > span');
  expect(isContentOwnedPassiveChrome(markerNote)).toBe(true);
  expect(markerIcon?.getAttribute('class')).toContain('pointer-events-none');
  expect(markerNumber?.getAttribute('class')).toContain('pointer-events-none');
  let pointStack: Element[] = [passiveChrome, pageTarget];
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: vi.fn(() => pointStack),
  });

  const passiveClick = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: 20,
    clientY: 30,
    composed: true,
  });
  await act(async () => {
    passiveChrome.dispatchEvent(passiveClick);
  });

  expect(latest?.viewState.selection?.element).toBe(pageTarget);
  expect(passiveClick.defaultPrevented).toBe(true);

  for (const [visualChild, clientX] of [
    [markerIcon, 20],
    [markerNumber, 28],
  ] as const) {
    expect(visualChild).not.toBeNull();
    pointStack = [markerNote!, annotatedPageTarget];
    const markerClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY: 30,
      composed: true,
    });
    await act(async () => {
      markerNote?.dispatchEvent(markerClick);
    });

    expect(latest?.viewState.selection?.element).toBe(annotatedPageTarget);
    expect(markerClick.defaultPrevented).toBe(true);
  }

  pointStack = [inspectorControl, pageBehindControl];
  const controlClick = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: 20,
    clientY: 30,
    composed: true,
  });
  await act(async () => {
    inspectorControl.dispatchEvent(controlClick);
  });

  expect(latest?.viewState.selection?.element).toBe(annotatedPageTarget);
  expect(controlClick.defaultPrevented).toBe(false);
  unregisterPassiveChrome();
});

it('selects the inner element for a trusted click inside a same-origin iframe', async () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const iframeDocument = iframe.contentDocument;
  expect(iframeDocument).not.toBeNull();
  const target = iframeDocument!.createElement('p');
  target.id = 'iframe-target';
  target.textContent = 'Iframe target';
  target.getClientRects = vi.fn(() => ({
    0: DOMRect.fromRect({ height: 40, width: 80 }),
    [Symbol.iterator]: () => [DOMRect.fromRect({ height: 40, width: 80 })][Symbol.iterator](),
    item: (index: number) => (index === 0 ? DOMRect.fromRect({ height: 40, width: 80 }) : null),
    length: 1,
  }));
  iframeDocument!.body.append(target);
  iframeDocument!.elementFromPoint = vi.fn(() => target);

  await renderHarness();
  await openInspector();
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  expect(latest?.viewState.selection?.element).toBe(target);
});

it('selects only the iframe after a trusted focus transfer into a cross-origin document', async () => {
  const iframe = document.createElement('iframe');
  iframe.src = 'https://cross-origin.example/frame';
  document.body.append(iframe);
  frameMocks.isIframeAccessible.mockReturnValue(false);

  await renderHarness();
  await openInspector();
  await act(async () => {
    iframe.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    iframe.focus();
    expect(document.activeElement).toBe(iframe);
    expect(readPageStyleSelectionSnapshot(iframe)).not.toBeNull();
    window.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });

  expect(trustedEventMocks.isTrustedDomEvent).toHaveBeenCalled();
  expect(latest?.viewState.selection?.element).toBe(iframe);
});

it('does not select an inaccessible iframe from programmatic focus without pointer intent', async () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  frameMocks.isIframeAccessible.mockReturnValue(false);

  await renderHarness();
  await openInspector();
  await act(async () => {
    iframe.focus();
    window.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });

  expect(latest?.viewState.selection).toBeNull();
});
