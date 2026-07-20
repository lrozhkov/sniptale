// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { createPageStyleRuntimeController } from './controller';

function createRule(id: string, selector: string): PageStyleRestoreRule {
  return {
    createdAt: 1,
    enabled: true,
    id,
    name: id,
    patch: { assets: [], declarations: [{ property: 'color', value: 'red' }] },
    propertySummary: ['color'],
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress: 'https://example.test/page',
    },
    selector: { locator: selector },
    updatedAt: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

it('applies matching rules idempotently on the current page', async () => {
  const element = document.createElement('div');
  element.id = 'target';
  document.body.append(element);
  const controller = createPageStyleRuntimeController({
    assetResolver: {
      dispose: vi.fn(),
      resolveAssetUrl: vi.fn(),
    },
    listRules: vi.fn(async () => [createRule('rule-1', '#target')]),
    readPage: () => ({ pageDomain: 'example.test', pageUrl: 'https://example.test/page' }),
  });

  await expect(controller.applyMatchingRestoreRules()).resolves.toEqual({
    appliedRuleIds: ['rule-1'],
    diagnostics: [],
  });
  await controller.applyMatchingRestoreRules();

  expect(element.style.color).toBe('red');
});

it('returns only selector-resolved active rules in the current page summary', async () => {
  const element = document.createElement('div');
  element.id = 'target';
  document.body.append(element);
  const controller = createPageStyleRuntimeController({
    listRules: vi.fn(async () => [
      createRule('resolved', '#target'),
      createRule('missing', '#missing'),
      { ...createRule('disabled', '#target'), enabled: false },
    ]),
    readPage: () => ({ pageDomain: 'example.test', pageUrl: 'https://example.test/page' }),
  });

  await expect(controller.getCurrentPageAppliedRuleSummary()).resolves.toMatchObject({
    activeAppliedCount: 1,
    matchedRules: [{ id: 'resolved' }],
    pageDomain: 'example.test',
    pageUrl: 'https://example.test/page',
  });
});

it('does not let stale async summaries overwrite newer current-page status', async () => {
  const first = document.createElement('div');
  first.id = 'first';
  const second = document.createElement('div');
  second.id = 'second';
  document.body.append(first, second);
  const firstRules = deferred<PageStyleRestoreRule[]>();
  const secondRules = deferred<PageStyleRestoreRule[]>();
  const listRules = vi
    .fn<() => Promise<PageStyleRestoreRule[]>>()
    .mockReturnValueOnce(firstRules.promise)
    .mockReturnValueOnce(secondRules.promise);
  const controller = createPageStyleRuntimeController({
    listRules,
    readPage: () => ({ pageDomain: 'example.test', pageUrl: 'https://example.test/page' }),
  });

  const firstSummary = controller.getCurrentPageAppliedRuleSummary();
  const secondSummary = controller.getCurrentPageAppliedRuleSummary();
  secondRules.resolve([createRule('second-rule', '#second')]);
  await expect(secondSummary).resolves.toMatchObject({
    matchedRules: [{ id: 'second-rule' }],
  });

  firstRules.resolve([createRule('first-rule', '#first')]);
  await expect(firstSummary).resolves.toMatchObject({
    matchedRules: [{ id: 'second-rule' }],
  });
});

it('tracks inspector open requests with monotonic request ids', () => {
  const controller = createPageStyleRuntimeController();

  expect(controller.openInspector('rules')).toEqual({
    isOpen: true,
    requestId: 1,
    targetTab: 'rules',
  });
  expect(controller.openInspector('templates')).toEqual({
    isOpen: true,
    requestId: 2,
    targetTab: 'templates',
  });
});
