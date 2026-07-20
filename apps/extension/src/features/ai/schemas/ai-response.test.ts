import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { schemaMessage } from './ai-utils';
import {
  AIResponseSchema,
  AIRequestSchema,
  formatLlmResponseParseError,
  parseLlmJsonResponse,
  validateAIResponse,
} from './ai-response';

function getValidAiResponse(): string {
  return JSON.stringify({
    f: [{ c: 'Old', id: 'field-1', n: 'Title', new: 'New value' }],
    i: 'fill',
    t: [
      {
        r: [
          {
            d: { price: '$10' },
            id: 'row-1',
            new: { price: '$12' },
          },
        ],
        ttl: 'Products',
      },
    ],
  });
}

function getSchemaError(): z.ZodError {
  try {
    AIResponseSchema.parse({
      f: [{ c: 'Old', id: 'field-1', n: 'Title', new: 42 }],
      i: 'fill',
      t: [],
    });
    throw new Error('Expected schema parsing to fail');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error;
    }

    throw error;
  }
}

function assertSchemaErrorFormatting(): void {
  const message = formatLlmResponseParseError(getSchemaError());

  expect(message).toContain(schemaMessage('validation.runtime.validationErrorPrefix'));
  expect(message).toContain('f.0.new');
}

function assertSyntaxErrorFormatting(): void {
  const message = formatLlmResponseParseError(new SyntaxError('Unexpected end of JSON input'));

  expect(message).toContain(schemaMessage('validation.runtime.jsonParseErrorPrefix'));
  expect(message).toContain('Unexpected end of JSON input');
}

function assertGenericErrorFormatting(): void {
  expect(formatLlmResponseParseError(new Error('Transport failed'))).toBe('Transport failed');
}

function assertUnknownErrorFormatting(): void {
  expect(formatLlmResponseParseError('nope')).toBe(
    schemaMessage('validation.runtime.unknownError')
  );
}

function assertValidateFailureCompatibility(): void {
  expect(validateAIResponse('{"i":"fill","f":[')).toEqual(
    parseLlmJsonResponse('{"i":"fill","f":[')
  );
}

function assertValidateSuccessCompatibility(): void {
  expect(validateAIResponse(getValidAiResponse())).toEqual(
    parseLlmJsonResponse(getValidAiResponse())
  );
}

function assertAliasSchemaCompatibility(): void {
  expect(AIResponseSchema).toBe(AIRequestSchema);
  expect(AIResponseSchema.parse(JSON.parse(getValidAiResponse()))).toEqual(
    AIRequestSchema.parse(JSON.parse(getValidAiResponse()))
  );
}

describe('ai-response parse error formatting', () => {
  it(
    'formats zod validation issues with the stable validation prefix',
    assertSchemaErrorFormatting
  );

  it('formats syntax errors with the JSON parse prefix', assertSyntaxErrorFormatting);

  it('returns generic error messages unchanged', assertGenericErrorFormatting);

  it(
    'falls back to the unknown parse error message for non-error values',
    assertUnknownErrorFormatting
  );
});

describe('validateAIResponse compatibility', () => {
  it(
    'returns the same failure payload as the canonical parser',
    assertValidateFailureCompatibility
  );

  it(
    'returns the same success payload as the canonical parser',
    assertValidateSuccessCompatibility
  );

  it(
    'keeps the response schema aligned with the request schema alias',
    assertAliasSchemaCompatibility
  );
});
