// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { createPageStyleRuntimeDiagnostic } from './diagnostics';
import { createCurrentPageAppliedRuleSummary } from './summary';

function createRule(): PageStyleRestoreRule {
  return {
    createdAt: 1,
    enabled: true,
    id: 'rule-1',
    name: 'Rule',
    patch: { assets: [], declarations: [{ property: 'color', value: 'red' }] },
    propertySummary: ['color'],
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress: 'https://example.test/page',
    },
    selector: { locator: '#target' },
    updatedAt: 1,
  };
}

describe('page style runtime summary and diagnostics', () => {
  it('creates current-page summary for applied rules', () => {
    const rule = createRule();
    const element = document.createElement('div');

    expect(
      createCurrentPageAppliedRuleSummary({
        matchedRules: [{ element, rule }],
        page: { pageDomain: 'example.test', pageUrl: 'https://example.test/page' },
      })
    ).toEqual({
      activeAppliedCount: 1,
      matchedRules: [
        {
          enabled: true,
          id: 'rule-1',
          name: 'Rule',
          propertySummary: ['color'],
          scope: rule.scope,
        },
      ],
      pageDomain: 'example.test',
      pageUrl: 'https://example.test/page',
    });
  });

  it('omits absent domains and optional diagnostic rule ids', () => {
    expect(
      createCurrentPageAppliedRuleSummary({
        matchedRules: [],
        page: { pageDomain: null, pageUrl: 'about:blank' },
      })
    ).toEqual({
      activeAppliedCount: 0,
      matchedRules: [],
      pageUrl: 'about:blank',
    });
    expect(createPageStyleRuntimeDiagnostic('warning', 'message')).toEqual({
      level: 'warning',
      message: 'message',
    });
  });
});
