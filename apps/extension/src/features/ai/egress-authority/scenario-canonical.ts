import { redactScenarioAiUrl } from '../scenario-redaction';
import { AiEgressAuthorityError } from './errors';
import { isRecord, stableStringify } from './stable-json';

export function canonicalizeScenarioJsonObjectField(label: string, value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new AiEgressAuthorityError(`${label} must be valid JSON`);
  }

  if (!isRecord(parsed)) {
    throw new AiEgressAuthorityError(`${label} must be a JSON object`);
  }

  return stableStringify(sanitizeScenarioJsonValue(parsed));
}

function sanitizeScenarioJsonValue(value: unknown, keyHint?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeScenarioJsonValue(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sanitizeScenarioJsonValue(value[key], key)])
    );
  }
  if (typeof value === 'string' && keyHint && /url$/iu.test(keyHint)) {
    return redactScenarioAiUrl(value);
  }
  return value;
}
