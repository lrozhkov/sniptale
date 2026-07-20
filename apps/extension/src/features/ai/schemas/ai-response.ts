import { z } from 'zod';

import { schemaMessage, schemaMessageKey, translateSchemaMessage } from './ai-utils';

export const FieldSchema = z.object({
  id: z.string().min(1, schemaMessageKey('validation.schemas.fieldIdRequired')),
  n: z.string().min(1, schemaMessageKey('validation.schemas.fieldNameRequired')),
  c: z.string(),
  new: z.string(),
});

export type Field = z.infer<typeof FieldSchema>;

export const TableRowSchema = z.object({
  id: z.string().min(1, schemaMessageKey('validation.schemas.rowIdRequired')),
  d: z.record(z.string(), z.string()),
  new: z.record(z.string(), z.string()),
});

export type TableRow = z.infer<typeof TableRowSchema>;

export const TableSchema = z.object({
  ttl: z.string().min(1, schemaMessageKey('validation.schemas.tableTitleRequired')),
  r: z.array(TableRowSchema).min(1, schemaMessageKey('validation.schemas.tableMustHaveRow')),
});

export type Table = z.infer<typeof TableSchema>;

export const AIRequestSchema = z.object({
  i: z.string().min(1, schemaMessageKey('validation.schemas.instructionRequired')),
  f: z.array(FieldSchema),
  t: z.array(TableSchema),
});

export type AIRequest = z.infer<typeof AIRequestSchema>;
const aiResponseSchema = AIRequestSchema;

export { aiResponseSchema as AIResponseSchema };
export type AIResponse = AIRequest;

export type LlmJsonResponseParseSuccess = {
  success: true;
  data: AIResponse;
};

export type LlmJsonResponseParseFailure = {
  success: false;
  error: string;
};

export type LlmJsonResponseParseResult = LlmJsonResponseParseSuccess | LlmJsonResponseParseFailure;

/**
 * Converts JSON/schema parser failures into a stable user-facing LLM validation error.
 */
export function formatLlmResponseParseError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return `${schemaMessage('validation.runtime.validationErrorPrefix')}\n${error.issues
      .map((issue) => `${issue.path.join('.')}: ${translateSchemaMessage(issue.message)}`)
      .join('\n')}`;
  }

  if (error instanceof SyntaxError) {
    return `${schemaMessage('validation.runtime.jsonParseErrorPrefix')}: ${error.message}`;
  }

  return error instanceof Error ? error.message : schemaMessage('validation.runtime.unknownError');
}

/**
 * Parses and validates raw LLM JSON output into the canonical normalized response shape.
 */
export function parseLlmJsonResponse(response: string): LlmJsonResponseParseResult {
  try {
    const parsed: unknown = JSON.parse(response);

    return {
      success: true,
      data: aiResponseSchema.parse(parsed),
    };
  } catch (error) {
    return {
      success: false,
      error: formatLlmResponseParseError(error),
    };
  }
}

/**
 * Preserves the legacy validation helper contract while delegating to the canonical parser.
 */
export function validateAIResponse(response: string): {
  success: boolean;
  data?: AIResponse;
  error?: string;
} {
  const result = parseLlmJsonResponse(response);

  if (result.success) {
    return result;
  }

  return result;
}
