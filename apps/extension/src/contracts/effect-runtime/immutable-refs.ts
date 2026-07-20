import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';

const SHA256 = /^[a-f0-9]{64}$/u;

export function isEffectRuntimeImmutableId(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

export async function createEffectRuntimeAssetSelectionId(
  assets: readonly { id: string; sha256: string }[]
): Promise<string> {
  const canonical = [...assets]
    .sort((left, right) => {
      if (left.id !== right.id) return left.id < right.id ? -1 : 1;
      return left.sha256 < right.sha256 ? -1 : left.sha256 > right.sha256 ? 1 : 0;
    })
    .map(({ id, sha256 }) => `${id}\u0000${sha256}`)
    .join('\n');
  return sha256EffectV1Bytes(new TextEncoder().encode(canonical));
}
