// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { PageStylesSection } from '.';

const mocks = vi.hoisted(() => ({
  deleteRule: vi.fn(),
  listRules: vi.fn(),
  setEnabled: vi.fn(),
  updateScope: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  formatDateTime: (value: number) => `date:${value}`,
  translate: (key: string) => key,
}));

vi.mock('../../../composition/persistence/page-style/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/page-style/storage')>()),
  listPageStyleRestoreRules: mocks.listRules,
  setPageStyleRestoreRuleEnabled: mocks.setEnabled,
  updatePageStyleRestoreRuleScope: mocks.updateScope,
}));

vi.mock('../../../composition/persistence/page-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/page-style')>()),
  deletePageStyleRestoreRuleAndCleanupAssets: mocks.deleteRule,
}));

let rules: PageStyleRestoreRule[] = [];
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createRule(overrides: Partial<PageStyleRestoreRule> = {}): PageStyleRestoreRule {
  return {
    createdAt: 1_000,
    enabled: true,
    id: 'rule-1',
    name: 'Primary card',
    patch: { assets: [], declarations: [{ property: 'color', value: '#111111' }] },
    propertySummary: ['color'],
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      domain: 'example.com',
      exactAddress: 'https://example.com/orders',
    },
    selector: { locator: '.card-title' },
    updatedAt: 2_000,
    ...overrides,
  };
}

async function renderSection() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => root?.render(<PageStylesSection />));
}

async function flushAsync() {
  await act(async () => Promise.resolve());
}

function getButtonByTitle(title: string): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  if (!button) {
    throw new Error(`Missing button: ${title}`);
  }

  return button;
}

function changeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  rules = [
    createRule(),
    createRule({
      enabled: false,
      id: 'rule-2',
      name: 'Admin header',
      propertySummary: ['background-image'],
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
        domain: 'admin.example.test',
        exactAddress: 'https://admin.example.test/home',
      },
    }),
  ];
  mocks.listRules.mockImplementation(async () => rules);
  mocks.setEnabled.mockImplementation(async (ruleId: string, enabled: boolean) => {
    rules = rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule));
    return true;
  });
  mocks.updateScope.mockImplementation(async (ruleId: string, scope) => {
    rules = rules.map((rule) => (rule.id === ruleId ? { ...rule, scope } : rule));
    return rules.find((rule) => rule.id === ruleId) ?? null;
  });
  mocks.deleteRule.mockImplementation(async (ruleId: string) => {
    rules = rules.filter((rule) => rule.id !== ruleId);
    return { cleanupFailedAssetIds: [], deleted: true };
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function registerPageStyleRenderTests() {
  it('renders saved rules and filters by address', async () => {
    await renderSection();
    await flushAsync();

    expect(container?.textContent).toContain('Primary card');
    expect(container?.textContent).toContain('Admin header');

    const searchInput = container?.querySelector<HTMLInputElement>('input');
    await act(async () => {
      if (searchInput) {
        changeInputValue(searchInput, 'admin');
      }
    });

    expect(container?.textContent).not.toContain('Primary card');
    expect(container?.textContent).toContain('Admin header');
  });
}

function registerPageStyleMutationTests() {
  it('updates enabled state and rule scope only after storage writes succeed', async () => {
    await renderSection();
    await flushAsync();

    const toggleButton = container?.querySelector<HTMLButtonElement>(
      'button[aria-label="settings.pageStyles.disabled"]'
    );
    await act(async () => {
      toggleButton?.click();
    });
    await flushAsync();

    expect(mocks.setEnabled).toHaveBeenCalledWith('rule-1', false);
    expect(container?.textContent).toContain('settings.pageStyles.saved');

    const scopeButtons = Array.from(container?.querySelectorAll('button') ?? []);
    const useDomainButton = scopeButtons.find(
      (button) => button.textContent === 'settings.pageStyles.useDomain'
    );
    await act(async () => {
      useDomainButton?.click();
    });

    const inputs = container?.querySelectorAll<HTMLInputElement>('input');
    await act(async () => {
      const domainInput = inputs?.[3];
      if (domainInput) {
        changeInputValue(domainInput, 'docs.example.com');
      }
      getButtonByTitle('settings.pageStyles.saveScope').click();
    });
    await flushAsync();

    expect(mocks.updateScope).toHaveBeenCalledWith('rule-1', {
      active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
      domain: 'docs.example.com',
      exactAddress: 'https://example.com/orders',
    });
  });
}

function registerPageStyleFailureTests() {
  it('loads failure state and allows removing the optional domain scope', async () => {
    mocks.listRules.mockRejectedValueOnce(new Error('storage failed'));
    await renderSection();
    await flushAsync();

    expect(container?.textContent).toContain('settings.pageStyles.loadError');

    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;

    await renderSection();
    await flushAsync();

    await act(async () => {
      getButtonByTitle('settings.pageStyles.clearDomain').click();
    });
    await act(async () => {
      getButtonByTitle('settings.pageStyles.saveScope').click();
    });
    await flushAsync();

    expect(mocks.updateScope).toHaveBeenCalledWith('rule-1', {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      domain: null,
      exactAddress: 'https://example.com/orders',
    });
  });
}

function registerPageStyleDeleteTests() {
  it('deletes rules, reports cleanup warnings, and surfaces write failures without rollback drift', async () => {
    mocks.deleteRule.mockResolvedValueOnce({
      cleanupFailedAssetIds: ['asset-1'],
      deleted: true,
    });
    await renderSection();
    await flushAsync();

    await act(async () => {
      getButtonByTitle('settings.pageStyles.deleteRule').click();
    });
    await flushAsync();

    expect(container?.textContent).toContain('settings.pageStyles.deletedWithCleanupWarning');

    mocks.setEnabled.mockRejectedValueOnce(new Error('write failed'));
    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('button[aria-label="settings.pageStyles.disabled"]')
        ?.click();
    });
    await flushAsync();

    expect(container?.textContent).toContain('settings.pageStyles.saveError');
    expect(container?.textContent).toContain('settings.pageStyles.enabled');
  });
}

function registerPageStyleNoopTests() {
  it('handles no-op deletes and invalid domain derivation without stale success state', async () => {
    mocks.deleteRule.mockResolvedValueOnce({ cleanupFailedAssetIds: [], deleted: false });
    await renderSection();
    await flushAsync();

    await act(async () => {
      getButtonByTitle('settings.pageStyles.deleteRule').click();
    });
    await flushAsync();

    expect(container?.textContent).not.toContain('settings.pageStyles.deleted');

    const inputs = container?.querySelectorAll<HTMLInputElement>('input');
    await act(async () => {
      if (inputs?.[2]) {
        changeInputValue(inputs[2], 'not a url');
      }
      if (inputs?.[3]) {
        changeInputValue(inputs[3], '');
      }
    });
    const scopeButtons = Array.from(container?.querySelectorAll('button') ?? []);
    await act(async () => {
      scopeButtons
        .find((button) => button.textContent === 'settings.pageStyles.useDomain')
        ?.click();
    });
    await act(async () => {
      getButtonByTitle('settings.pageStyles.saveScope').click();
    });
    await flushAsync();

    expect(mocks.updateScope).toHaveBeenCalledWith('rule-1', {
      active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
      domain: null,
      exactAddress: 'not a url',
    });
  });
}

describe('PageStylesSection', () => {
  registerPageStyleRenderTests();
  registerPageStyleMutationTests();
  registerPageStyleFailureTests();
  registerPageStyleDeleteTests();
  registerPageStyleNoopTests();
});
