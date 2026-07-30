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

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: ReturnType<typeof usePageStyleInspectorController> | null = null;

function Harness() {
  latest = usePageStyleInspectorController({
    quickEditDocumentMode: false,
    quickEditMode: true,
  });
  return null;
}

async function renderHarness() {
  host = document.createElement('div');
  document.body.append(host);
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
