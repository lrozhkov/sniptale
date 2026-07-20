import type { ScenarioStepKind } from '@sniptale/runtime-contracts/scenario/types/base';

export function getNow(): number {
  return Date.now();
}

export function createBaseStep<TKind extends ScenarioStepKind>(args: {
  body?: string;
  kind: TKind;
  title?: string;
}) {
  const now = getNow();
  return {
    id: crypto.randomUUID(),
    kind: args.kind,
    title: args.title ?? '',
    body: args.body ?? '',
    createdAt: now,
    updatedAt: now,
  };
}
