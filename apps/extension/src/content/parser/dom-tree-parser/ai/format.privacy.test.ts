import { describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { formatDataForAI, formatDataForAIJSON } from './format';

function createSecretPayloadFixture(): ParsedDOMTree {
  return {
    context: 'Demo context',
    title: 'Demo page',
    structure: [
      {
        type: 'section',
        id: 'section-profile',
        title: 'Profile',
        children: [
          {
            type: 'field',
            id: 'field-name',
            label: 'Name',
            selected: true,
            value: 'Alice',
            valueType: 'string',
          },
          {
            type: 'field',
            id: 'field-password',
            label: 'Password',
            selected: true,
            value: 'visible-secret',
            valueType: 'string',
          },
          {
            type: 'table',
            id: 'table-profile',
            headers: ['Name', 'API token'],
            rows: [
              {
                data: { 'API token': 'row-secret', Name: 'Alice' },
                id: 'row-1',
                selected: true,
                selector: '#row-1',
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('dom-tree-parser AI privacy formatting', () => {
  it('omits secret-like fields and columns from editable AI JSON', () => {
    const formatted = formatDataForAIJSON(createSecretPayloadFixture());

    expect(formatted).toContain('Alice');
    expect(formatted).not.toContain('visible-secret');
    expect(formatted).not.toContain('row-secret');
    expect(formatted).not.toContain('Password');
    expect(formatted).not.toContain('API token');
  });

  it('omits secret-like table columns from editable AI markdown', () => {
    const markdown = formatDataForAI(createSecretPayloadFixture());

    expect(markdown).toContain('Alice');
    expect(markdown).not.toContain('row-secret');
    expect(markdown).not.toContain('API token');
  });
});
