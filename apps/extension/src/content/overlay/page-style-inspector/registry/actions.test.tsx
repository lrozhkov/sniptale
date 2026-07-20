// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
  type PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import { usePageStyleRegistryActions } from './actions';

const mocks = vi.hoisted(() => ({
  deletePageStyleRestoreRuleAndCleanupAssets: vi.fn(),
  deletePageStyleTemplateAndCleanupAssets: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../../../../composition/persistence/page-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/page-style')>()),
  deletePageStyleRestoreRuleAndCleanupAssets: mocks.deletePageStyleRestoreRuleAndCleanupAssets,
  deletePageStyleTemplateAndCleanupAssets: mocks.deletePageStyleTemplateAndCleanupAssets,
}));

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof usePageStyleRegistryActions> | null = null;

const template: PageStyleTemplate = {
  createdAt: 1,
  id: 'template-1',
  name: 'Template',
  patch: { assets: [], declarations: [] },
  propertySummary: [],
  updatedAt: 1,
};

const rule: PageStyleRestoreRule = {
  createdAt: 1,
  enabled: true,
  id: 'rule-1',
  name: 'Rule',
  patch: { assets: [], declarations: [] },
  propertySummary: [],
  scope: {
    active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
    exactAddress: 'https://example.com',
  },
  selector: { locator: '#target' },
  updatedAt: 1,
};

function Harness() {
  latest = usePageStyleRegistryActions(mocks.refresh);
  return null;
}

function renderHarness() {
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

it('surfaces template asset cleanup failures as a warning outcome', async () => {
  mocks.deletePageStyleTemplateAndCleanupAssets.mockResolvedValueOnce({
    cleanupFailedAssetIds: ['asset-orphan'],
    deleted: true,
  });
  renderHarness();

  let outcome: Awaited<ReturnType<NonNullable<typeof latest>['deleteTemplate']>>;
  await act(async () => {
    outcome = await latest?.deleteTemplate(template);
  });

  expect(mocks.deletePageStyleTemplateAndCleanupAssets).toHaveBeenCalledWith('template-1');
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(outcome).toEqual({
    message: 'Действие выполнено, но часть файлов не удалось очистить',
    state: 'warning',
  });
});

it('surfaces restore rule asset cleanup failures as a warning outcome', async () => {
  mocks.deletePageStyleRestoreRuleAndCleanupAssets.mockResolvedValueOnce({
    cleanupFailedAssetIds: ['asset-orphan'],
    deleted: true,
  });
  renderHarness();

  let outcome: Awaited<ReturnType<NonNullable<typeof latest>['deleteRule']>>;
  await act(async () => {
    outcome = await latest?.deleteRule(rule);
  });

  expect(mocks.deletePageStyleRestoreRuleAndCleanupAssets).toHaveBeenCalledWith('rule-1');
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(outcome).toEqual({
    message: 'Действие выполнено, но часть файлов не удалось очистить',
    state: 'warning',
  });
});
