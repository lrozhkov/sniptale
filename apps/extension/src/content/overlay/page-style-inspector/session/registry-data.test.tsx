// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleCurrentPageRuleSummary,
  type PageStyleRestoreRule,
  type PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import { useRegistryData } from './hooks';

const mocks = vi.hoisted(() => ({
  listPageStyleRestoreRules: vi.fn(),
  listPageStyleTemplates: vi.fn(),
  summarizePageStyleRulesForPage: vi.fn(),
}));

vi.mock('../../../../composition/persistence/page-style/storage', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/page-style/storage')
  >()),
  listPageStyleRestoreRules: mocks.listPageStyleRestoreRules,
  listPageStyleTemplates: mocks.listPageStyleTemplates,
  summarizePageStyleRulesForPage: mocks.summarizePageStyleRulesForPage,
}));

vi.mock('../runtime/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/actions')>()),
  readCurrentPageStyleIdentity: vi.fn(() => ({
    pageDomain: 'example.com',
    pageUrl: 'https://example.com/page',
  })),
}));

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof useRegistryData> | null = null;

function createTemplate(id: string): PageStyleTemplate {
  return {
    createdAt: 1,
    id,
    name: id,
    patch: { assets: [], declarations: [] },
    propertySummary: [],
    updatedAt: 1,
  };
}

function createRule(id: string, updatedAt: number): PageStyleRestoreRule {
  return {
    createdAt: 1,
    enabled: true,
    id,
    name: id,
    patch: { assets: [], declarations: [] },
    propertySummary: [],
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress: 'https://example.com/page',
    },
    selector: { locator: `#${id}` },
    updatedAt,
  };
}

function createSummary(...ids: string[]): PageStyleCurrentPageRuleSummary {
  return {
    activeAppliedCount: ids.length,
    matchedRules: ids.map((id) => ({
      enabled: true,
      id,
      name: id,
      propertySummary: [],
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/page',
      },
    })),
    pageUrl: 'https://example.com/page',
  };
}

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function renderHook(open = false) {
  function Harness() {
    latest = useRegistryData(open);
    return null;
  }

  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(<Harness />);
  });
}

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
});

it('keeps older registry refreshes from overwriting newer cache state', async () => {
  const oldTemplates = createDeferred<PageStyleTemplate[]>();
  const oldRules = createDeferred<PageStyleRestoreRule[]>();
  const oldSummary = createDeferred<PageStyleCurrentPageRuleSummary>();
  mocks.listPageStyleTemplates
    .mockReturnValueOnce(oldTemplates.promise)
    .mockResolvedValueOnce([createTemplate('new-template')]);
  mocks.listPageStyleRestoreRules
    .mockReturnValueOnce(oldRules.promise)
    .mockResolvedValueOnce([createRule('new-rule', 2)]);
  mocks.summarizePageStyleRulesForPage
    .mockReturnValueOnce(oldSummary.promise)
    .mockResolvedValueOnce(createSummary('new-rule'));
  renderHook();

  let oldRefresh: Promise<void> | undefined;
  let newRefresh: Promise<void> | undefined;
  await act(async () => {
    oldRefresh = latest?.refresh();
    await Promise.resolve();
  });
  await act(async () => {
    newRefresh = latest?.refresh();
    await newRefresh;
  });
  expect(latest?.templates.map((template) => template.id)).toEqual(['new-template']);

  await act(async () => {
    oldTemplates.resolve([createTemplate('old-template')]);
    oldRules.resolve([createRule('old-rule', 1)]);
    oldSummary.resolve(createSummary('old-rule'));
    await oldRefresh;
  });
  expect(latest?.templates.map((template) => template.id)).toEqual(['new-template']);
  expect(latest?.rules.map((rule) => rule.id)).toEqual(['new-rule']);
});

it('surfaces registry refresh failures without clearing existing cache', async () => {
  mocks.listPageStyleTemplates
    .mockResolvedValueOnce([createTemplate('template-a')])
    .mockRejectedValueOnce(new Error('storage failed'));
  mocks.listPageStyleRestoreRules.mockResolvedValue([createRule('rule-a', 1)]);
  mocks.summarizePageStyleRulesForPage.mockResolvedValue(createSummary('rule-a'));
  renderHook();

  await act(async () => {
    await latest?.refresh();
  });
  await act(async () => {
    await latest?.refresh();
  });

  expect(latest?.error).toBe('Не удалось загрузить шаблоны и правила');
  expect(latest?.templates.map((template) => template.id)).toEqual(['template-a']);
  expect(latest?.rules.map((rule) => rule.id)).toEqual(['rule-a']);
});
