// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { usePageStyleRulesController } from './controller';

const mocks = vi.hoisted(() => ({
  listRules: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../composition/persistence/page-style/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/page-style/storage')>()),
  listPageStyleRestoreRules: mocks.listRules,
}));

type Controller = ReturnType<typeof usePageStyleRulesController>;

let container: HTMLDivElement | null = null;
let currentController: Controller | null = null;
let root: Root | null = null;

function createRule(): PageStyleRestoreRule {
  return {
    createdAt: 1,
    enabled: true,
    id: 'rule-1',
    name: 'Primary card',
    patch: { assets: [], declarations: [{ property: 'color', value: '#111111' }] },
    propertySummary: ['color'],
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
      domain: 'example.com',
      exactAddress: 'https://example.com/orders',
    },
    selector: { locator: '.card-title' },
    updatedAt: 2,
  };
}

function Probe() {
  currentController = usePageStyleRulesController();
  return null;
}

async function renderProbe() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  currentController = null;
  mocks.listRules.mockResolvedValue([createRule()]);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('ignores stale page-style loads after unmount', async () => {
  let resolveRules: (rules: PageStyleRestoreRule[]) => void = () => undefined;
  mocks.listRules.mockReturnValueOnce(new Promise((resolve) => (resolveRules = resolve)));

  await renderProbe();
  act(() => root?.unmount());
  resolveRules([createRule()]);
  await act(async () => Promise.resolve());

  expect(currentController?.state.isLoading).toBe(true);
});

it('leaves drafts unchanged when clearing a missing rule domain', async () => {
  await renderProbe();
  await act(async () => Promise.resolve());
  const draftsBefore = currentController?.state.drafts;

  act(() => currentController?.clearDomain('missing-rule'));

  expect(currentController?.state.drafts).toBe(draftsBefore);
});
