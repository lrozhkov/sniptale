import { expect, it } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { createPageStyleRuleListItem, filterPageStyleRuleItems } from './filters';

function createRule(overrides: Partial<PageStyleRestoreRule> = {}): PageStyleRestoreRule {
  return {
    createdAt: 1,
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
    updatedAt: 2,
    ...overrides,
  };
}

it('normalizes address, selector, and property summaries for filtering', () => {
  const items = [
    createPageStyleRuleListItem(createRule()),
    createPageStyleRuleListItem(
      createRule({
        enabled: false,
        id: 'rule-2',
        propertySummary: ['background-image'],
        scope: {
          active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
          domain: 'admin.example.test',
          exactAddress: 'https://admin.example.test/home',
        },
      })
    ),
  ];

  expect(
    filterPageStyleRuleItems({
      items,
      propertyFilter: 'all',
      searchQuery: 'ORDERS',
      statusFilter: 'all',
    }).map((item) => item.rule.id)
  ).toEqual(['rule-1']);
  expect(
    filterPageStyleRuleItems({
      items,
      propertyFilter: 'background-image',
      searchQuery: 'admin',
      statusFilter: 'disabled',
    }).map((item) => item.rule.id)
  ).toEqual(['rule-2']);
});

it('filters content-retaining and asset-backed rules from typed rule fields', () => {
  const items = [
    createPageStyleRuleListItem(createRule()),
    createPageStyleRuleListItem(
      createRule({
        contentRetention: { text: { enabled: true, text: 'Approved text' } },
        id: 'retained',
      })
    ),
    createPageStyleRuleListItem(
      createRule({
        id: 'asset-backed',
        patch: {
          assets: [
            {
              assetId: 'asset-1',
              kind: 'backgroundImage',
              mimeType: 'image/png',
            },
          ],
          declarations: [{ property: 'background-image', value: null }],
        },
      })
    ),
  ];

  expect(
    filterPageStyleRuleItems({
      items,
      propertyFilter: 'all',
      searchQuery: '',
      statusFilter: 'contentRetaining',
    }).map((item) => item.rule.id)
  ).toEqual(['retained']);
  expect(
    filterPageStyleRuleItems({
      items,
      propertyFilter: 'all',
      searchQuery: '',
      statusFilter: 'assetBacked',
    }).map((item) => item.rule.id)
  ).toEqual(['asset-backed']);
});

it('filters address and domain separately from selector/name search', () => {
  const items = [
    createPageStyleRuleListItem(createRule({ id: 'orders' })),
    createPageStyleRuleListItem(
      createRule({
        id: 'profile',
        name: 'Same selector card',
        scope: {
          active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
          domain: 'profile.example.com',
          exactAddress: 'https://profile.example.com/users',
        },
      })
    ),
  ];

  expect(
    filterPageStyleRuleItems({
      addressQuery: 'profile.example.com',
      items,
      propertyFilter: 'all',
      searchQuery: 'card',
      statusFilter: 'all',
    }).map((item) => item.rule.id)
  ).toEqual(['profile']);
});
