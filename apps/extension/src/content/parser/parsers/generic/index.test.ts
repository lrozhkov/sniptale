// @vitest-environment jsdom

import { expect, it } from 'vitest';
import * as genericParsers from './index';

it('keeps the generic parser facade explicit', () => {
  expect(Object.keys(genericParsers).sort()).toEqual([
    'DefinitionListParser',
    'DetailsHierarchicalTableParser',
    'DynamicFieldsEmbeddedAppParser',
    'FormFieldsParser',
    'KeyValueTableParser',
    'MvsEmbeddedAppParser',
    'PortalHomepageParser',
    'SemanticSectionParser',
    'ServiceCallSummaryParser',
    'TextContentParser',
    'extractGenericContent',
    'extractGenericContentSections',
  ]);
  expect(genericParsers).not.toHaveProperty('extractSearchResults');
});
