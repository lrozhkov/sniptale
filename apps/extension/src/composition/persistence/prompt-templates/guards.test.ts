import { describe, expect, it } from 'vitest';

import { parseStoredPromptTemplates, parseStoredTemplateOrder } from './guards';

function verifyTemplateParsing() {
  expect(
    parseStoredPromptTemplates([
      {
        id: 'template-1',
        name: 'Template',
        content: 'Body',
        isDefault: true,
        lastUsedAt: 123,
      },
      {
        id: 'broken',
        name: 'Broken',
      },
    ])
  ).toEqual({
    hasInvalidRoot: false,
    invalidEntryCount: 1,
    templates: [
      {
        id: 'template-1',
        name: 'Template',
        content: 'Body',
        isDefault: true,
        lastUsedAt: 123,
      },
    ],
  });
}

function verifyTemplateRootFallbacks() {
  expect(parseStoredPromptTemplates(undefined)).toEqual({
    hasInvalidRoot: false,
    invalidEntryCount: 0,
    templates: [],
  });
  expect(parseStoredPromptTemplates('broken')).toEqual({
    hasInvalidRoot: true,
    invalidEntryCount: 0,
    templates: [],
  });
}

function verifyInvalidOptionalTemplateFieldsAreDropped() {
  expect(
    parseStoredPromptTemplates([
      {
        id: 'template-1',
        name: 'Template',
        content: 'Body',
        isDefault: 'yes',
      },
      {
        id: 'template-2',
        name: 'Template 2',
        content: 'Body 2',
        lastUsedAt: 'later',
      },
    ])
  ).toEqual({
    hasInvalidRoot: false,
    invalidEntryCount: 2,
    templates: [],
  });
}

function verifyTemplateOrderParsing() {
  expect(parseStoredTemplateOrder(['template-2', 42, 'template-1'])).toEqual({
    hasInvalidRoot: false,
    invalidEntryCount: 1,
    orderedIds: ['template-2', 'template-1'],
  });
}

function verifyTemplateOrderRootFallbacks() {
  expect(parseStoredTemplateOrder(undefined)).toEqual({
    hasInvalidRoot: false,
    invalidEntryCount: 0,
    orderedIds: [],
  });
  expect(parseStoredTemplateOrder({ ids: ['template-1'] })).toEqual({
    hasInvalidRoot: true,
    invalidEntryCount: 0,
    orderedIds: [],
  });
}

function verifyEmptyTemplateCollectionsStayValid() {
  expect(parseStoredPromptTemplates([])).toEqual({
    hasInvalidRoot: false,
    invalidEntryCount: 0,
    templates: [],
  });
  expect(parseStoredTemplateOrder([])).toEqual({
    hasInvalidRoot: false,
    invalidEntryCount: 0,
    orderedIds: [],
  });
}

function runPromptTemplateStorageGuardsSuite() {
  it('accepts valid template entries and counts dropped invalid items', verifyTemplateParsing);
  it(
    'drops template entries with malformed optional metadata fields',
    verifyInvalidOptionalTemplateFieldsAreDropped
  );
  it(
    'rejects invalid roots and preserves empty defaults for missing values',
    verifyTemplateRootFallbacks
  );
  it(
    'accepts string ids for template ordering and drops non-string entries',
    verifyTemplateOrderParsing
  );
  it(
    'rejects invalid template-order roots and keeps undefined values empty',
    verifyTemplateOrderRootFallbacks
  );
  it('keeps empty template collections valid', verifyEmptyTemplateCollectionsStayValid);
}

describe('prompt-templates guards', runPromptTemplateStorageGuardsSuite);
