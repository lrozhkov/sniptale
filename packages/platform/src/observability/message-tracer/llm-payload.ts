import { redactSensitiveString } from '../../security/secret-redaction';

const LLM_TRACE_TYPE_PATTERN = /LLM|Llm|llm/;
const SENSITIVE_LLM_FIELDS = new Set([
  'attachments',
  'cleanedResponse',
  'data',
  'html',
  'instructions',
  'jsonData',
  'llmSessionToken',
  'markdownData',
  'project',
  'projectSnapshot',
  'prompt',
  'rawResponse',
  'text',
  'texts',
]);
const SAFE_LLM_FIELDS = new Set([
  'contractVersion',
  'error',
  'kind',
  'modelId',
  'requestKind',
  'status',
  'success',
  'type',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeLlmTracePayload(messageType: string, payload: unknown): unknown {
  if (!LLM_TRACE_TYPE_PATTERN.test(messageType)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return summarizeLlmField('payload', payload);
  }

  const summary: Record<string, unknown> = {};
  Object.setPrototypeOf(summary, null);

  for (const [key, value] of Object.entries(payload)) {
    if (SAFE_LLM_FIELDS.has(key)) {
      summary[key] = typeof value === 'string' ? redactSensitiveString(value, 200) : value;
      continue;
    }

    if (SENSITIVE_LLM_FIELDS.has(key)) {
      Object.assign(summary, summarizeLlmField(key, value));
      continue;
    }

    if (key.toLowerCase().includes('token') || key.toLowerCase().includes('response')) {
      Object.assign(summary, summarizeLlmField(key, value));
    }
  }

  return summary;
}

function summarizeLlmField(key: string, value: unknown): Record<string, unknown> {
  const prefix = `${key}Summary`;
  if (typeof value === 'string') {
    return { [`${prefix}Length`]: value.length };
  }

  if (Array.isArray(value)) {
    return { [`${prefix}Count`]: value.length };
  }

  if (value === null || value === undefined) {
    return { [`${prefix}Present`]: false };
  }

  return { [`${prefix}Present`]: true };
}
