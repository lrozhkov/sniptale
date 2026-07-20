import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStylePatch,
} from '@sniptale/runtime-contracts/page-style';
import { saveDefaultPageStyleRule, saveRetainedPageStyleRule } from './test-support';

const mocks = vi.hoisted(() => ({
  localGet: vi.fn(),
  localSet: vi.fn(),
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/browser-storage')>()),
  browserStorage: {
    local: {
      get: mocks.localGet,
      set: mocks.localSet,
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => mocks.logger,
}));

const PATCH: PageStylePatch = {
  assets: [],
  declarations: [{ property: 'color', value: '#111111' }],
};

function createStoredState(): Record<string, unknown> {
  return {};
}

async function importStorage() {
  vi.resetModules();
  return import('./index');
}

function setupStorageState(state: Record<string, unknown>) {
  mocks.localGet.mockImplementation(async (keys: string[]) => {
    const key = keys[0] ?? '';
    return { [key]: state[key] };
  });
  mocks.localSet.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(state, items);
  });
}

describe('page style storage reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns an empty clone-safe registry when storage has no value', async () => {
    const state = createStoredState();
    setupStorageState(state);
    const storage = await importStorage();

    const registry = await storage.loadPageStyleRegistry();
    registry.templates.push({
      createdAt: 1,
      id: 'mutated',
      name: 'Mutated',
      patch: PATCH,
      propertySummary: ['color'],
      updatedAt: 1,
    });

    await expect(storage.loadPageStyleRegistry()).resolves.toEqual(
      storage.createEmptyPageStyleRegistry()
    );
  });
});

describe('page style storage mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    setupStorageState(createStoredState());
  });

  registerPageStyleTemplateMutationTests();
  registerPageStyleRuleScopeTests();
  registerPageStyleRetentionTests();
});

function registerPageStyleTemplateMutationTests() {
  registerQueuedTemplateMutationTests();
  registerTemplateCrudTests();
}

function registerQueuedTemplateMutationTests() {
  it('queues concurrent template writes without losing previous mutations', async () => {
    const storage = await importStorage();

    await Promise.all([
      storage.savePageStyleTemplate({ id: 'template-a', name: 'A', patch: PATCH }),
      storage.savePageStyleTemplate({ id: 'template-b', name: 'B', patch: PATCH }),
    ]);

    expect(mocks.localSet).toHaveBeenCalledTimes(2);
    await expect(storage.listPageStyleTemplates()).resolves.toEqual([
      expect.objectContaining({ id: 'template-a', name: 'A' }),
      expect.objectContaining({ id: 'template-b', name: 'B' }),
    ]);
  });
}

function registerTemplateCrudTests() {
  it('creates, updates, and deletes templates with clone-safe patches', async () => {
    const storage = await importStorage();
    const created = await storage.savePageStyleTemplate({
      id: 'template-1',
      name: 'Initial',
      patch: PATCH,
    });

    created.patch.declarations[0] = { property: 'width', value: '10px' };
    await expect(storage.listPageStyleTemplates()).resolves.toEqual([
      expect.objectContaining({
        name: 'Initial',
        patch: PATCH,
        propertySummary: ['color'],
      }),
    ]);

    vi.setSystemTime(2_000);
    await storage.savePageStyleTemplate({
      id: 'template-1',
      name: 'Updated',
      patch: {
        assets: [],
        declarations: [{ property: 'width', value: '100px' }],
      },
    });

    await expect(storage.listPageStyleTemplates()).resolves.toEqual([
      expect.objectContaining({
        createdAt: 1_000,
        name: 'Updated',
        propertySummary: ['width'],
        updatedAt: 2_000,
      }),
    ]);
    await expect(storage.deletePageStyleTemplate('template-1')).resolves.toBe(true);
    await expect(storage.deletePageStyleTemplate('missing')).resolves.toBe(false);
  });
}

function registerPageStyleRuleScopeTests() {
  it('creates rules disabled by request and summarizes exact-address versus domain scope', async () => {
    const storage = await importStorage();

    await storage.savePageStyleRestoreRule({
      enabled: false,
      id: 'exact-rule',
      name: 'Exact',
      patch: PATCH,
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        domain: 'example.com',
        exactAddress: 'https://example.com/a',
      },
      selector: { locator: '[data-sniptale-id="a"]', sniptaleId: 'a' },
    });
    await storage.savePageStyleRestoreRule({
      id: 'domain-rule',
      name: 'Domain',
      patch: PATCH,
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
        domain: 'example.com',
        exactAddress: 'https://example.com/b',
      },
      selector: { locator: '[data-sniptale-id="b"]' },
    });

    await expect(
      storage.summarizePageStyleRulesForPage({
        pageDomain: 'example.com',
        pageUrl: 'https://example.com/a',
      })
    ).resolves.toEqual({
      activeAppliedCount: 1,
      matchedRules: [
        expect.objectContaining({ enabled: false, id: 'exact-rule' }),
        expect.objectContaining({ enabled: true, id: 'domain-rule' }),
      ],
      pageDomain: 'example.com',
      pageUrl: 'https://example.com/a',
    });

    await expect(storage.setPageStyleRestoreRuleEnabled('exact-rule', true)).resolves.toBe(true);
    await expect(storage.setPageStyleRestoreRuleEnabled('missing-rule', false)).resolves.toBe(
      false
    );
    await expect(storage.deletePageStyleRestoreRule('domain-rule')).resolves.toBe(true);
  });
}

function registerPageStyleRetentionTests() {
  registerDefaultPageStyleRetentionTests();
  registerExistingPageStyleRetentionTests();
}

function registerDefaultPageStyleRetentionTests() {
  it('keeps content retention absent by default and persists opt-in asset references only', async () => {
    const storage = await importStorage();

    await saveDefaultPageStyleRule(storage, PATCH);
    await saveRetainedPageStyleRule(storage);

    const rules = await storage.listPageStyleRestoreRules();
    expect(rules[0]?.contentRetention).toBeUndefined();
    expect(rules[1]?.contentRetention).toEqual(
      expect.objectContaining({
        text: { enabled: true, text: 'User approved text' },
      })
    );
    expect(JSON.stringify(mocks.localSet.mock.calls)).not.toContain('data:image/png;base64');
  });
}

function registerExistingPageStyleRetentionTests() {
  it('preserves opt-in content retention when updating an existing rule style patch', async () => {
    const storage = await importStorage();

    await storage.savePageStyleRestoreRule({
      contentRetention: {
        text: { enabled: true, text: 'Approved text' },
      },
      id: 'retained-rule',
      name: 'Retained',
      patch: PATCH,
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/retained',
      },
      selector: { locator: '#retained' },
      templateId: 'template-1',
    });
    await storage.savePageStyleRestoreRuleWithAssetCleanup(
      {
        id: 'retained-rule',
        name: 'Retained updated',
        patch: {
          assets: [],
          declarations: [{ property: 'width', value: '100px' }],
        },
        scope: {
          active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
          exactAddress: 'https://example.com/retained',
        },
        selector: { locator: '#retained' },
      },
      { deleteAsset: vi.fn() }
    );

    await expect(storage.listPageStyleRestoreRules()).resolves.toEqual([
      expect.objectContaining({
        contentRetention: {
          text: { enabled: true, text: 'Approved text' },
        },
        name: 'Retained updated',
        propertySummary: ['width'],
        templateId: 'template-1',
      }),
    ]);
  });
}
