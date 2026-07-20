import { expect, it } from 'vitest';

import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { parseAIResponse } from './response-markdown';

const originalTree: ParsedDOMTree = {
  context: 'Support Portal',
  title: 'Ticket 42',
  structure: [],
};

it('parses field edits from a markdown table without section headings', () => {
  const response = `
| field_id | field_name | current_value | new_value |
| --- | --- | --- | --- |
| field-1 | Status | Open | Closed |
| field-2 | Empty |  |  |
`;

  expect(parseAIResponse(response, originalTree)).toEqual({
    changes: [
      {
        type: 'field',
        fieldId: 'field-1',
        fieldName: 'Status',
        newValue: 'Closed',
      },
    ],
    errors: [],
  });
});

it('parses row edits from sectioned markdown tables', () => {
  const response = `
## Assets
| row_id | 1. Name | new_1. Name | new_2. Notes |
| --- | --- | --- | --- |
| row-1 | Laptop | Workstation | Updated |
| row-2 | Tablet |  |  |
`;

  expect(parseAIResponse(response, originalTree)).toEqual({
    changes: [
      {
        type: 'tableRow',
        rowId: 'row-1',
        columnEdits: {
          Name: 'Workstation',
          Notes: 'Updated',
        },
      },
    ],
    errors: [],
  });
});

it('preserves escaped pipes and markdown line breaks inside parsed edits', () => {
  const response = `
## Fields
| field_id | field_name | current_value | new_value |
| --- | --- | --- | --- |
| field-1 | Notes | Old | Updated\\|Value<br />Line 2 |
`;

  expect(parseAIResponse(response, originalTree)).toEqual({
    changes: [
      {
        type: 'field',
        fieldId: 'field-1',
        fieldName: 'Notes',
        newValue: 'Updated|Value\nLine 2',
      },
    ],
    errors: [],
  });
});

it('reports missing required columns and unsupported section schemas', () => {
  const response = `
## Fields
| field_id | field_name | current_value |
| --- | --- | --- |
| field-1 | Status | Open |

## Unknown
| current_value | suggested_value |
| --- | --- |
| A | B |
`;

  expect(parseAIResponse(response, originalTree)).toEqual({
    changes: [],
    errors: [
      'Секция "Fields": нет колонки new_value',
      'Секция "Unknown": не найдены field_id или row_id',
    ],
  });
});

it('ignores malformed or empty sections without creating false edits', () => {
  const response = `
## Empty

## Broken
not a table
`;

  expect(parseAIResponse(response, originalTree)).toEqual({
    changes: [],
    errors: [],
  });
});

it('ignores blank row edits inside sectioned markdown tables', () => {
  const response = `
## Assets
| row_id | 1. Name | new_1. Name |
| --- | --- | --- |
| row-1 | Laptop |   |
`;

  expect(parseAIResponse(response, originalTree)).toEqual({
    changes: [],
    errors: [],
  });
});
