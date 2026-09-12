import { expect, it } from 'vitest';
import { parseSettingsTransferDomains } from './domain-parser';

it('preserves scenario template scope through settings transfer and rejects unknown scopes', () => {
  const template = {
    id: 'custom-scenario',
    scope: 'scenario',
    name: 'My layout',
    content: 'Use equal columns',
    enabled: false,
  };
  const domains = {
    'ai.prompt-templates': { schemaVersion: 1, data: { items: [template], order: [template.id] } },
  };
  expect(parseSettingsTransferDomains(domains)['ai.prompt-templates']?.data).toEqual(
    domains['ai.prompt-templates'].data
  );
  expect(() =>
    parseSettingsTransferDomains({
      'ai.prompt-templates': {
        schemaVersion: 1,
        data: { items: [{ ...template, scope: 'unknown-editor' }], order: [] },
      },
    })
  ).toThrow();
});
