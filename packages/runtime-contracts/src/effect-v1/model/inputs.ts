import type { EffectV1InputContract, EffectV1Kind } from './types.js';

const CONTRACTS: Record<EffectV1Kind, EffectV1InputContract> = {
  standalone: { optional: [], required: [] },
  targetEffect: { optional: [], required: ['source'] },
  transition: { optional: [], required: ['from', 'to'] },
};

export function resolveEffectV1InputContract(kind: EffectV1Kind): EffectV1InputContract {
  return CONTRACTS[kind];
}
