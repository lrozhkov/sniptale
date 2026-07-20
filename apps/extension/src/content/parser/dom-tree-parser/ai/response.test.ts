import { describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { parseAIResponse, parseAIResponseJSON } from './response';

const emptyTree: ParsedDOMTree = {
  context: '',
  title: 'Demo page',
  structure: [],
};

describe('dom-tree-parser ai response markdown facade', () => {
  it('parses markdown field and table edits into changes', () => {
    const response = [
      '## Profile',
      '',
      '| field_id | field_name | current_value | new_value |',
      '|----------|------------|---------------|-----------|',
      '| field-name | Name | Alice | Alicia |',
      '',
      '## Devices',
      '',
      '| row_id | 1. Name | new_1. Name | new_2. Status |',
      '|----------|----------|--------------|----------------|',
      '| row-1 | Laptop | Workstation | Ready |',
    ].join('\n');

    const result = parseAIResponse(response, emptyTree);

    expect(result.errors).toEqual([]);
    expect(result.changes).toEqual([
      {
        type: 'field',
        fieldId: 'field-name',
        fieldName: 'Name',
        newValue: 'Alicia',
      },
      {
        type: 'tableRow',
        rowId: 'row-1',
        columnEdits: {
          Name: 'Workstation',
          Status: 'Ready',
        },
      },
    ]);
  });
});

function verifyJsonFieldAndTableEdits() {
  const response = JSON.stringify({
    i: 'Редактирование: Demo page',
    f: [
      { id: 'field-name', n: 'Name', c: 'Alice', new: 'Alicia' },
      { id: 'field-note', n: 'Note', c: 'None', new: '' },
    ],
    t: [
      {
        ttl: 'Devices',
        r: [
          {
            id: 'row-1',
            d: { Name: 'Laptop' },
            new: { Name: 'Workstation', Status: 'Ready' },
          },
        ],
      },
    ],
  });

  const result = parseAIResponseJSON(response, emptyTree);

  expect(result.errors).toEqual([]);
  expect(result.changes).toEqual([
    {
      type: 'field',
      fieldId: 'field-name',
      fieldName: 'Name',
      newValue: 'Alicia',
    },
    {
      type: 'tableRow',
      rowId: 'row-1',
      columnEdits: {
        Name: 'Workstation',
        Status: 'Ready',
      },
    },
  ]);
}

function verifyInvalidJsonPayload() {
  const result = parseAIResponseJSON('{"invalid":true}', emptyTree);

  expect(result.changes).toEqual([]);
  expect(result.errors).toEqual(['Ошибка парсинга JSON: некорректная структура ответа']);
}

function createBlankEditsJsonResponse() {
  return JSON.stringify({
    i: 'Редактирование: Demo page',
    f: [
      { id: 'field-name', n: 'Name', c: 'Alice', new: '   ' },
      { id: 'field-note', n: 'Note', c: 'None', new: 'Updated' },
    ],
    t: [
      {
        ttl: 'Devices',
        r: [
          {
            id: 'row-1',
            d: { Name: 'Laptop' },
            new: { Name: '   ' },
          },
        ],
      },
    ],
  });
}

function createMalformedNestedEntryJsonResponse() {
  return JSON.stringify({
    i: 'Редактирование: Demo page',
    f: [],
    t: [
      {
        ttl: 'Devices',
        r: [
          {
            id: 'row-1',
            d: { Name: 'Laptop' },
            new: { Name: 1 },
          },
        ],
      },
    ],
  });
}

function verifyBlankEditsAreFiltered() {
  const result = parseAIResponseJSON(createBlankEditsJsonResponse(), emptyTree);

  expect(result.errors).toEqual([]);
  expect(result.changes).toEqual([
    {
      type: 'field',
      fieldId: 'field-note',
      fieldName: 'Note',
      newValue: 'Updated',
    },
  ]);
}

function verifyMalformedNestedEntriesAreRejected() {
  expect(parseAIResponseJSON(createMalformedNestedEntryJsonResponse(), emptyTree)).toEqual({
    changes: [],
    errors: ['Ошибка парсинга JSON: некорректная структура ответа'],
  });
}

function verifyBlankEditsAndMalformedNestedEntries() {
  verifyBlankEditsAreFiltered();
  verifyMalformedNestedEntriesAreRejected();
}

describe('dom-tree-parser ai response json facade', () => {
  it('parses JSON field and table edits into changes', verifyJsonFieldAndTableEdits);

  it('returns a parse error for invalid json payloads', verifyInvalidJsonPayload);
});

describe('dom-tree-parser ai response json branch coverage', () => {
  it(
    'filters blank edits and rejects malformed nested table entries',
    verifyBlankEditsAndMalformedNestedEntries
  );
});
