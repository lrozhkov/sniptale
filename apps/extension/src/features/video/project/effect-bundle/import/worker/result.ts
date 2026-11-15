import { parseAnimationTemplateJson } from '@sniptale/runtime-contracts/animation-template';
import type {
  AnimationArtifactImportResult,
  ImportedAnimationTemplate,
} from '../../lottie-profile';
import { EFFECT_BUNDLE_LIMITS } from '../../limits';
import { parseAnimationPackMetadata } from '../../manifest';
import { hasExactKeys, isRecord } from '../../validation';
import { parseImportFailure } from './diagnostics';

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

/** The parent admits canonical source bytes, not a worker-provided parsed object graph. */
export async function parseAnimationImportResult(
  value: unknown,
  expectedArchiveSha256: string
): Promise<AnimationArtifactImportResult | null> {
  if (!isRecord(value) || typeof value['ok'] !== 'boolean') return null;
  if (!value['ok']) return parseImportFailure(value);
  if (
    !hasExactKeys(value, ['ok', 'kind', 'archiveSha256', 'documents', 'package'], ['package']) ||
    !isSha256(value['archiveSha256']) ||
    value['archiveSha256'] !== expectedArchiveSha256 ||
    (value['kind'] !== 'lottie-json' &&
      value['kind'] !== 'sniptale-animation' &&
      value['kind'] !== 'dotlottie') ||
    !Array.isArray(value['documents']) ||
    !value['documents'].length ||
    value['documents'].length > EFFECT_BUNDLE_LIMITS.maxDocuments
  )
    return null;
  const metadata =
    value['package'] === undefined ? undefined : parseAnimationPackMetadata(value['package']);
  if (metadata === null || (metadata && value['kind'] !== 'sniptale-animation')) return null;
  const documents: ImportedAnimationTemplate[] = [];
  const ids = new Set<string>();
  let retainedBytes = 0;
  for (const item of value['documents']) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ['source', 'sha256']) ||
      typeof item['source'] !== 'string' ||
      !isSha256(item['sha256'])
    )
      return null;
    const bytes = new TextEncoder().encode(item['source']);
    retainedBytes += bytes.byteLength;
    if (
      bytes.byteLength > EFFECT_BUNDLE_LIMITS.maxJsonBytes ||
      retainedBytes > EFFECT_BUNDLE_LIMITS.maxInflatedBytes
    )
      return null;
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0')
    ).join('');
    if (digest !== item['sha256']) return null;
    const parsed = await parseAnimationTemplateJson(item['source']);
    if (!parsed.ok || ids.has(parsed.template.id)) return null;
    ids.add(parsed.template.id);
    documents.push({ source: item['source'], sha256: item['sha256'], template: parsed.template });
  }
  return {
    ok: true,
    kind: value['kind'],
    archiveSha256: value['archiveSha256'],
    documents,
    ...(metadata ? { package: metadata } : {}),
  };
}
