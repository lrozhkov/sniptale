import type {
  ScenarioElementAnimationSettings,
  ScenarioElementBuildSettings,
  ScenarioElementFrame,
  ScenarioV3ElementBase,
  ScenarioV3ElementKind,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createDefaultScenarioElementFrame,
  createScenarioV3Id,
  getScenarioV3Now,
} from '../helpers';
import {
  createDefaultScenarioElementAnimation,
  createDefaultScenarioElementBuild,
} from '../presentation';

export function createScenarioElementBase<TKind extends ScenarioV3ElementKind>(args: {
  animation?: Partial<ScenarioElementAnimationSettings> | undefined;
  build?: Partial<ScenarioElementBuildSettings> | undefined;
  frame?: Partial<ScenarioElementFrame> | undefined;
  kind: TKind;
  name: string;
  role?: string | null | undefined;
  stylePresetId?: string | null | undefined;
}): ScenarioV3ElementBase<TKind> {
  const now = getScenarioV3Now();

  return {
    animation: createDefaultScenarioElementAnimation(args.animation),
    build: createDefaultScenarioElementBuild(args.build),
    createdAt: now,
    frame: createDefaultScenarioElementFrame(args.frame),
    id: createScenarioV3Id(args.kind),
    kind: args.kind,
    locked: false,
    name: args.name,
    opacity: 1,
    role: args.role ?? null,
    stylePresetId: args.stylePresetId ?? null,
    updatedAt: now,
    visible: true,
  };
}
