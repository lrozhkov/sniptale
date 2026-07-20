// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { matchPageStyleRestoreRules } from './matching';

function createRule(
  id: string,
  overrides: Partial<PageStyleRestoreRule> = {}
): PageStyleRestoreRule {
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
    selector: { locator: '#target' },
    updatedAt: 1,
    ...overrides,
  };
}

it('matches enabled exact-address rules and ignores disabled or broken selectors', () => {
  const target = document.createElement('div');
  target.id = 'target';
  document.body.append(target);

  const result = matchPageStyleRestoreRules({
    page: { pageDomain: 'example.test', pageUrl: 'https://example.test/page' },
    rules: [
      createRule('enabled'),
      createRule('disabled', { enabled: false }),
      createRule('broken', { selector: { locator: '#missing' } }),
    ],
  });

  expect(result.matchedRules.map((match) => match.rule.id)).toEqual(['enabled']);
  expect(result.diagnostics).toEqual([
    {
      level: 'warning',
      message: 'Page style rule selector did not resolve',
      ruleId: 'broken',
    },
  ]);
});

it('keeps domain scope distinct and applies broad domain rules before exact rules', () => {
  const target = document.createElement('div');
  target.id = 'target';
  document.body.append(target);

  const result = matchPageStyleRestoreRules({
    page: { pageDomain: 'example.test', pageUrl: 'https://example.test/page' },
    rules: [
      createRule('exact', { createdAt: 1 }),
      createRule('domain', {
        createdAt: 2,
        scope: {
          active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
          domain: 'example.test',
          exactAddress: 'https://other.test/page',
        },
      }),
      createRule('other-domain', {
        scope: {
          active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
          domain: 'other.test',
          exactAddress: 'https://other.test/page',
        },
      }),
    ],
  });

  expect(result.matchedRules.map((match) => match.rule.id)).toEqual(['domain', 'exact']);
});

it('falls back to data-sniptale-id when the composite locator is stale', () => {
  const target = document.createElement('div');
  target.dataset['sniptaleId'] = 'stable-1';
  document.body.append(target);

  const result = matchPageStyleRestoreRules({
    page: { pageDomain: 'example.test', pageUrl: 'https://example.test/page' },
    rules: [
      createRule('fallback', {
        selector: { locator: '#old-target', sniptaleId: 'stable-1' },
      }),
    ],
  });

  expect(result.matchedRules[0]?.element).toBe(target);
});

it('falls back to data-sniptale-id when the locator is malformed', () => {
  const target = document.createElement('div');
  target.dataset['sniptaleId'] = 'stable-malformed';
  document.body.append(target);

  const result = matchPageStyleRestoreRules({
    page: { pageDomain: 'example.test', pageUrl: 'https://example.test/page' },
    rules: [
      createRule('malformed-fallback', {
        selector: { locator: '[', sniptaleId: 'stable-malformed' },
      }),
    ],
  });

  expect(result.matchedRules[0]?.element).toBe(target);
  expect(result.diagnostics).toEqual([]);
});
