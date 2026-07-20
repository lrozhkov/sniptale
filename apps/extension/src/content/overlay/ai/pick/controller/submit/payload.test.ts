import { describe, expect, it } from 'vitest';

import { createAllowlistedAiEditablePayload } from './payload';

type ProjectedPayload = {
  f: Array<{ id: string; new: string }>;
  t: Array<{ r: Array<{ d: Record<string, string>; new: Record<string, string> }> }>;
};

function parseProjectedPayload(jsonData: string): ProjectedPayload {
  const payload = createAllowlistedAiEditablePayload(jsonData);
  expect(payload).not.toBeNull();
  return JSON.parse(payload ?? '{}') as ProjectedPayload;
}

function createMixedPayload() {
  return JSON.stringify({
    f: [
      {
        c: 'Alice',
        extra: 'drop-me',
        id: 'field-name',
        n: 'Name',
        new: 'prefilled-secret',
      },
      { c: 'visible-secret', id: 'field-password', n: 'Password', new: '' },
      { c: 'api_key=field-secret', id: 'field-notes', n: 'Notes', new: '' },
    ],
    note: 'Authorization: Bearer sk-live-secret',
    t: [
      {
        r: [
          {
            d: {
              'API token': 'row-secret',
              Name: 'Alice',
              Value: 'safe',
              Visible: 'token=generic-row-secret',
            },
            id: 'row-1',
            new: { Name: 'prefilled-row-secret' },
          },
        ],
        ttl: 'Profile',
      },
    ],
  });
}

function expectAllowedValues(projectedText: string | null) {
  expect(projectedText).toContain('Alice');
  expect(projectedText).toContain('safe');
}

function expectSensitiveValuesAbsent(projectedText: string | null) {
  [
    'visible-secret',
    'sk-live-secret',
    'row-secret',
    'field-secret',
    'generic-row-secret',
    'prefilled-secret',
    'prefilled-row-secret',
    'drop-me',
  ].forEach((secret) => {
    expect(projectedText).not.toContain(secret);
  });
}

describe('ai-pick-controller submit payload projector', () => {
  it('allowlists editable payload shape and strips sensitive or unknown data', () => {
    const projectedText = createAllowlistedAiEditablePayload(createMixedPayload());
    const projected = parseProjectedPayload(createMixedPayload());

    expectAllowedValues(projectedText);
    expectSensitiveValuesAbsent(projectedText);
    expect(projected.f.map((field) => field.id)).toEqual(['field-name']);
    expect(projected.t[0]?.r[0]?.new).toEqual({ Name: '', Value: '' });
  });

  it('fails closed when selected data is not an editable payload', () => {
    expect(createAllowlistedAiEditablePayload('{"selected":true}')).toBeNull();
  });

  it('fails closed when projection leaves no editable values', () => {
    const cases = [
      JSON.stringify({ f: [], i: 'empty', t: [] }),
      JSON.stringify({
        f: [{ c: 'visible-secret', id: 'field-password', n: 'Password', new: '' }],
        t: [],
      }),
      JSON.stringify({ f: [{ c: 123, id: 'field-invalid', n: 'Name', new: '' }], t: [] }),
      JSON.stringify({
        f: [],
        t: [
          {
            r: [
              {
                d: { Notes: 'api_key=generic-row-secret' },
                id: 'row-1',
                new: {},
              },
            ],
            ttl: 'Secrets',
          },
        ],
      }),
    ];

    cases.forEach((jsonData) => {
      expect(createAllowlistedAiEditablePayload(jsonData)).toBeNull();
    });
  });
});
