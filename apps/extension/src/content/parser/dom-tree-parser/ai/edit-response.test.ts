import { describe, expect, it } from 'vitest';

import { parseAiEditResponseJson } from './edit-response';

describe('parseAiEditResponseJson valid structures', () => {
  it('parses field and table edits from valid AI JSON', () => {
    expect(
      parseAiEditResponseJson(
        JSON.stringify({
          i: 'Edit page',
          f: [
            { id: 'field-name', n: 'Name', c: 'Alice', new: 'Alicia' },
            { id: 'field-note', n: 'Note', c: 'Empty', new: '   ' },
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
        })
      )
    ).toEqual({
      changes: [
        {
          fieldId: 'field-name',
          fieldName: 'Name',
          newValue: 'Alicia',
          type: 'field',
        },
        {
          columnEdits: {
            Name: 'Workstation',
            Status: 'Ready',
          },
          rowId: 'row-1',
          type: 'tableRow',
        },
      ],
      errors: [],
    });
  });
});

describe('parseAiEditResponseJson malformed structures', () => {
  it('rejects malformed AI JSON structures', () => {
    expect(parseAiEditResponseJson('{"invalid":true}')).toEqual({
      changes: [],
      errors: ['Ошибка парсинга JSON: некорректная структура ответа'],
    });
    expect(
      parseAiEditResponseJson(
        JSON.stringify({
          i: 'Edit page',
          f: [{ id: 'field-name', n: 'Name', c: 'Alice', new: 42 }],
          t: [],
        })
      )
    ).toEqual({
      changes: [],
      errors: ['Ошибка парсинга JSON: некорректная структура ответа'],
    });
    expect(
      parseAiEditResponseJson(
        JSON.stringify({
          i: 'Edit page',
          f: [],
          t: [{ ttl: 'Devices', r: [{ id: 'row-1', d: null, new: { Name: 'Ready' } }] }],
        })
      )
    ).toEqual({
      changes: [],
      errors: ['Ошибка парсинга JSON: некорректная структура ответа'],
    });
  });
});
