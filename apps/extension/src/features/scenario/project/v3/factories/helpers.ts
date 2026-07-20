import type {
  ScenarioElementFrame,
  ScenarioSlideCanvas,
} from '@sniptale/runtime-contracts/scenario/types/v3';

export const DEFAULT_SCENARIO_V3_CANVAS: ScenarioSlideCanvas = {
  background: {
    color: '#f3ede2',
    kind: 'solid',
  },
  height: 720,
  width: 1280,
};

export function getScenarioV3Now(): number {
  return Date.now();
}

export function createScenarioV3Id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createDefaultScenarioElementFrame(
  overrides: Partial<ScenarioElementFrame> = {}
): ScenarioElementFrame {
  return {
    height: overrides.height ?? 120,
    width: overrides.width ?? 320,
    x: overrides.x ?? 80,
    y: overrides.y ?? 80,
  };
}
