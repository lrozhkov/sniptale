import { describe, expect, it } from 'vitest';
import { PAGE_STYLE_SCOPE_TYPES } from '@sniptale/runtime-contracts/page-style';
import { PAGE_STYLE_LIMITS } from '@sniptale/runtime-contracts/page-style/limits';
import { createEmptyPageStyleRegistry, parseStoredPageStyleRegistry } from './guards';

const VALID_TEMPLATE = {
  createdAt: 1,
  id: 'template-1',
  name: 'Template',
  patch: {
    assets: [],
    declarations: [{ property: 'color', value: '#111111' }],
  },
  propertySummary: ['color'],
  updatedAt: 1,
};

const VALID_RULE = {
  createdAt: 1,
  enabled: true,
  id: 'rule-1',
  name: 'Rule',
  patch: {
    assets: [],
    declarations: [{ property: 'width', value: '100px' }],
  },
  propertySummary: ['width'],
  scope: {
    active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
    exactAddress: 'https://example.com/page',
  },
  selector: { locator: '#target' },
  updatedAt: 1,
};

describe('page style storage parser record budgets', () => {
  it('drops oversized registry records before they become stored rules or templates', () => {
    expect(
      parseStoredPageStyleRegistry({
        restoreRules: [
          createRuleWithLongTextRetention(),
          createRuleWithLongSelector(),
          { ...VALID_RULE, id: 'r'.repeat(PAGE_STYLE_LIMITS.maxRecordIdLength + 1) },
          { ...VALID_RULE, templateId: 't'.repeat(PAGE_STYLE_LIMITS.maxRecordIdLength + 1) },
        ],
        templates: [
          {
            ...VALID_TEMPLATE,
            id: 't'.repeat(PAGE_STYLE_LIMITS.maxRecordIdLength + 1),
          },
          createTemplateWithLongCssValue(),
        ],
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidEntryCount: 6,
      value: createEmptyPageStyleRegistry(),
    });
  });
});

describe('page style storage parser array budgets', () => {
  it('caps retained registry arrays to the documented page-style limits', () => {
    expect(
      parseStoredPageStyleRegistry({
        restoreRules: Array.from(
          { length: PAGE_STYLE_LIMITS.maxRegistryRules + 1 },
          (_, index) => ({
            ...VALID_RULE,
            id: `rule-${index}`,
          })
        ),
        templates: Array.from(
          { length: PAGE_STYLE_LIMITS.maxRegistryTemplates + 1 },
          (_, index) => ({
            ...VALID_TEMPLATE,
            id: `template-${index}`,
          })
        ),
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidEntryCount: 2,
      value: {
        restoreRules: expect.arrayContaining([expect.objectContaining({ id: 'rule-0' })]),
        schemaVersion: 1,
        templates: expect.arrayContaining([expect.objectContaining({ id: 'template-0' })]),
      },
    });
  });
});

function createRuleWithLongTextRetention() {
  return {
    ...VALID_RULE,
    contentRetention: {
      text: {
        enabled: true,
        text: 'x'.repeat(PAGE_STYLE_LIMITS.maxRetainedTextLength + 1),
      },
    },
  };
}

function createRuleWithLongSelector() {
  return {
    ...VALID_RULE,
    selector: { locator: '#'.repeat(PAGE_STYLE_LIMITS.maxSelectorLength + 1) },
  };
}

function createTemplateWithLongCssValue() {
  return {
    ...VALID_TEMPLATE,
    patch: {
      assets: [],
      declarations: [
        { property: 'color', value: 'x'.repeat(PAGE_STYLE_LIMITS.maxCssValueLength + 1) },
      ],
    },
  };
}
