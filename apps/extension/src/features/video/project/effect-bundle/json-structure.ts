import { EFFECT_BUNDLE_LIMITS } from './limits';

export type EffectJsonStructureErrorCode =
  | 'depth'
  | 'encoding'
  | 'nodes'
  | 'size'
  | 'string'
  | 'syntax';

export class EffectJsonStructureError extends Error {
  readonly code: EffectJsonStructureErrorCode;

  constructor(code: EffectJsonStructureErrorCode) {
    super(`Effect JSON structural preflight failed: ${code}`);
    this.name = 'EffectJsonStructureError';
    this.code = code;
  }
}

export function parseBoundedEffectJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0 || bytes.byteLength > EFFECT_BUNDLE_LIMITS.maxJsonBytes) {
    throw new EffectJsonStructureError('size');
  }
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new EffectJsonStructureError('encoding');
  }
  assertBoundedJsonStructure(source);
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new EffectJsonStructureError('syntax');
  }
}

export function assertBoundedJsonStructure(source: string): void {
  let depth = 0;
  let nodes = 1;
  let inString = false;
  let escaped = false;
  let stringCharacters = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      } else {
        stringCharacters += 1;
        if (stringCharacters > EFFECT_BUNDLE_LIMITS.maxJsonStringCharacters) {
          throw new EffectJsonStructureError('string');
        }
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      stringCharacters = 0;
      nodes += 1;
    } else if (character === '{' || character === '[') {
      depth += 1;
      nodes += 1;
      if (depth > EFFECT_BUNDLE_LIMITS.maxJsonDepth) {
        throw new EffectJsonStructureError('depth');
      }
    } else if (character === '}' || character === ']') {
      depth -= 1;
      if (depth < 0) throw new EffectJsonStructureError('syntax');
    } else if (character === ',' || character === ':') {
      nodes += 1;
    }
    if (nodes > EFFECT_BUNDLE_LIMITS.maxJsonNodes) {
      throw new EffectJsonStructureError('nodes');
    }
  }
  if (inString || escaped || depth !== 0) {
    throw new EffectJsonStructureError('syntax');
  }
}
