import { describe, expect, it } from 'vitest';

import { tokenizeJsonForPreview } from './tokenizer';

describe('tokenizeJsonForPreview', () => {
  it('marks keys, strings, numbers, booleans, and null values', () => {
    expect(tokenizeJsonForPreview('{"name":"Alice","count":12,"ok":true,"value":null}')).toEqual([
      '{',
      '<span class="sniptale-json-key">"name"</span>',
      ':',
      '<span class="sniptale-json-string">"Alice"</span>',
      ',',
      '<span class="sniptale-json-key">"count"</span>',
      ':',
      '<span class="sniptale-json-number">12</span>',
      ',',
      '<span class="sniptale-json-key">"ok"</span>',
      ':',
      '<span class="sniptale-json-boolean">true</span>',
      ',',
      '<span class="sniptale-json-key">"value"</span>',
      ':',
      '<span class="sniptale-json-null">null</span>',
      '}',
    ]);
  });

  it('keeps escaped quotes and exponent numbers inside a single token', () => {
    expect(tokenizeJsonForPreview('{"quote":"a\\\\\\"b","amount":-1.2e+3}')).toEqual([
      '{',
      '<span class="sniptale-json-key">"quote"</span>',
      ':',
      '<span class="sniptale-json-string">"a\\\\\\"b"</span>',
      ',',
      '<span class="sniptale-json-key">"amount"</span>',
      ':',
      '<span class="sniptale-json-number">-1.2e+3</span>',
      '}',
    ]);
  });
});
