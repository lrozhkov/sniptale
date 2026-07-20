import { describe, expect, it } from 'vitest';
import { PAGE_STYLE_SCOPE_TYPES } from '@sniptale/runtime-contracts/page-style';
import { isPageStyleCurrentPageRuleSummary, isPageStyleInspectorTab } from './page-style';

describe('page style messaging validators', () => {
  registerAcceptedPageStyleValidatorTests();
  registerRejectedPageStyleValidatorTests();
});

function registerAcceptedPageStyleValidatorTests() {
  it('validates inspector tabs and current-page rule summaries', () => {
    expect(isPageStyleInspectorTab('rules')).toBe(true);
    expect(isPageStyleInspectorTab('unknown')).toBe(false);

    expect(
      isPageStyleCurrentPageRuleSummary({
        activeAppliedCount: 1,
        matchedRules: [
          {
            enabled: true,
            id: 'rule-1',
            name: 'Rule',
            propertySummary: ['color'],
            scope: {
              active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
              domain: null,
              exactAddress: 'https://example.com/page',
            },
          },
        ],
        pageDomain: 'example.com',
        pageUrl: 'https://example.com/page',
      })
    ).toBe(true);
  });
}

function registerRejectedPageStyleValidatorTests() {
  it('rejects malformed summaries', () => {
    expect(isPageStyleCurrentPageRuleSummary(null)).toBe(false);
    expect(
      isPageStyleCurrentPageRuleSummary({
        activeAppliedCount: '1',
        matchedRules: [],
        pageUrl: 'https://example.com/page',
      })
    ).toBe(false);
    expect(
      isPageStyleCurrentPageRuleSummary({
        activeAppliedCount: 1,
        matchedRules: [
          {
            enabled: true,
            id: 'rule-1',
            name: 'Rule',
            propertySummary: ['unknown'],
            scope: {
              active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
              exactAddress: 'https://example.com/page',
            },
          },
        ],
        pageUrl: 'https://example.com/page',
      })
    ).toBe(false);
  });
}
