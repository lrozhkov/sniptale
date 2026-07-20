// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  listPageStyleRestoreRules: vi.fn(),
  listPageStyleTemplates: vi.fn(),
  summarizePageStyleRulesForPage: vi.fn(),
}));

const trustedEventMocks = vi.hoisted(() => ({
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
  isTrustedMouseEvent: trustedEventMocks.isTrustedMouseEvent,
}));

import { usePageStyleInspectorController } from './controller';

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
  trustedEventMocks.isTrustedMouseEvent.mockReturnValue(true);
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
