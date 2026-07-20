import { describe, expect, it } from 'vitest';
import { PAGE_STYLE_SCOPE_TYPES } from '@sniptale/runtime-contracts/page-style';
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

describe('page style storage parser guard coverage', () => {
  registerPageStyleEmptyRegistryTests();
  registerPageStyleValidRegistryTests();
  registerPageStyleInvalidRegistryTests();
});

function registerPageStyleEmptyRegistryTests() {
  it('returns an empty registry when storage has no value', () => {
    expect(parseStoredPageStyleRegistry(undefined)).toEqual({
      hasInvalidRoot: false,
      invalidEntryCount: 0,
      value: createEmptyPageStyleRegistry(),
    });
  });

  it('falls back to an empty registry for malformed roots and drops invalid entries', () => {
    expect(parseStoredPageStyleRegistry('bad-root')).toEqual({
      hasInvalidRoot: true,
      invalidEntryCount: 0,
      value: createEmptyPageStyleRegistry(),
    });

    expect(
      parseStoredPageStyleRegistry({
        restoreRules: [{ id: 'rule-without-required-fields' }],
        templates: [{ id: 'template-without-required-fields' }],
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidEntryCount: 2,
      value: createEmptyPageStyleRegistry(),
    });
  });
}

function registerPageStyleValidRegistryTests() {
  it('parses valid templates, rules, assets, scopes, and explicit retention', () => {
    expect(
      parseStoredPageStyleRegistry({
        restoreRules: [
          {
            ...VALID_RULE,
            contentRetention: {
              image: {
                asset: { assetId: 'asset-1', kind: 'imageReplacement', width: null },
                enabled: true,
              },
              text: { enabled: true, text: 'Approved text' },
            },
            patch: {
              assets: [{ assetId: 'asset-bg', kind: 'backgroundImage', height: 20 }],
              declarations: [{ property: 'background-image', value: null }],
            },
            propertySummary: ['background-image'],
            scope: {
              active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
              domain: 'example.com',
              exactAddress: 'https://example.com/page',
            },
            templateId: null,
          },
        ],
        templates: [VALID_TEMPLATE],
      }).value
    ).toEqual({
      restoreRules: [
        expect.objectContaining({
          contentRetention: expect.objectContaining({
            text: { enabled: true, text: 'Approved text' },
          }),
          scope: expect.objectContaining({ active: PAGE_STYLE_SCOPE_TYPES.DOMAIN }),
        }),
      ],
      schemaVersion: 1,
      templates: [VALID_TEMPLATE],
    });
  });
}

function registerPageStyleInvalidRegistryTests() {
  it('rejects malformed nested patch, scope, selector, and retention payloads', () => {
    const invalidRules = [
      { ...VALID_RULE, patch: { declarations: [{ property: 'unknown', value: 'x' }] } },
      { ...VALID_RULE, scope: { active: 'global', exactAddress: 'https://example.com' } },
      { ...VALID_RULE, selector: { locator: 42 } },
      { ...VALID_RULE, contentRetention: { text: { enabled: false, text: 'x' } } },
    ];

    expect(
      parseStoredPageStyleRegistry({
        restoreRules: invalidRules,
        templates: [{ ...VALID_TEMPLATE, propertySummary: ['unknown'] }],
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidEntryCount: 5,
      value: createEmptyPageStyleRegistry(),
    });
  });
}
