import {
  sha256EffectV1Bytes,
  validateEffectV1Document,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import { parseBoundedEffectJson } from '../../features/video/project/effect-bundle/json-structure';
import { EFFECT_BUNDLE_LIMITS } from '../../features/video/project/effect-bundle/limits';

export async function parseAndVerifyEffectDocument(
  source: unknown,
  expectedSha256: string
): Promise<EffectV1Document | null> {
  if (
    typeof source !== 'string' ||
    source.length === 0 ||
    source.length > EFFECT_BUNDLE_LIMITS.maxJsonBytes
  ) {
    return null;
  }
  const bytes = new TextEncoder().encode(source);
  if (
    bytes.byteLength > EFFECT_BUNDLE_LIMITS.maxJsonBytes ||
    (await sha256EffectV1Bytes(bytes)) !== expectedSha256
  ) {
    return null;
  }
  let input: unknown;
  try {
    input = parseBoundedEffectJson(bytes);
  } catch {
    return null;
  }
  const validation = validateEffectV1Document(input);
  return validation.ok && validation.document ? validation.document : null;
}
