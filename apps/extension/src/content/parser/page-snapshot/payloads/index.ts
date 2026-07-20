import type { SnapshotPayloadBlob } from '../types';

const MAX_JSON_LD_SCHEMA_HINT_SCRIPTS = 25;
const MAX_JSON_LD_SCHEMA_HINT_SCRIPT_CHARS = 256 * 1024;
const MAX_JSON_LD_SCHEMA_HINT_TOTAL_CHARS = 512 * 1024;

function buildPayloadLocator(script: HTMLScriptElement, index: number): string {
  if (script.id) {
    return `script#${script.id}`;
  }

  const type = script.getAttribute('type') ?? 'application/json';
  return `script[type="${type}"]:nth-of-type(${index + 1})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function extractSnapshotPayloads(
  documentRoot: ParentNode = document
): SnapshotPayloadBlob[] {
  return Array.from(
    documentRoot.querySelectorAll(
      'script[type="application/json"], script[type="application/ld+json"]'
    )
  )
    .map((script, index) => {
      const type = script.getAttribute('type') ?? '';
      const text = script.textContent?.trim() || '';
      return {
        id: script.id || `payload-${index + 1}`,
        kind: type === 'application/ld+json' ? 'json-ld' : 'json',
        locator: buildPayloadLocator(script as HTMLScriptElement, index),
        source: 'script-tag',
        textLength: text.length,
      } satisfies SnapshotPayloadBlob;
    })
    .filter((payload) => payload.textLength > 0);
}

function findSchemaTextCandidate(payload: unknown, depth = 0): string | null {
  if (depth > 8 || payload === null || payload === undefined) {
    return null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const candidate = findSchemaTextCandidate(item, depth + 1);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload['text'] === 'string' && payload['text'].trim().length > 0) {
    return payload['text'].trim();
  }

  if (typeof payload['articleBody'] === 'string' && payload['articleBody'].trim().length > 0) {
    return payload['articleBody'].trim();
  }

  return (
    findSchemaTextCandidate(payload['@graph'], depth + 1) ??
    findSchemaTextCandidate(payload['mainEntity'], depth + 1) ??
    findSchemaTextCandidate(payload['mainEntityOfPage'], depth + 1)
  );
}

export function extractSchemaTextHint(documentRoot: ParentNode = document): string | undefined {
  const payloadScripts = Array.from(
    documentRoot.querySelectorAll('script[type="application/ld+json"]')
  );
  let parsedChars = 0;

  for (const payload of payloadScripts.slice(0, MAX_JSON_LD_SCHEMA_HINT_SCRIPTS)) {
    const text = payload.textContent?.trim();
    if (!text) {
      continue;
    }
    if (text.length > MAX_JSON_LD_SCHEMA_HINT_SCRIPT_CHARS) {
      continue;
    }
    if (parsedChars + text.length > MAX_JSON_LD_SCHEMA_HINT_TOTAL_CHARS) {
      break;
    }

    try {
      parsedChars += text.length;
      const parsed = JSON.parse(text) as unknown;
      const textHint = findSchemaTextCandidate(parsed);
      if (textHint) {
        return textHint;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}
