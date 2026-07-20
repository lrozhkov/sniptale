import type {
  ScenarioElement,
  ScenarioElementFrame,
} from '@sniptale/runtime-contracts/scenario/types/v3';

function getNudgeDelta(key: string, large: boolean): { x: number; y: number } | null {
  const step = large ? 10 : 1;

  if (key === 'ArrowDown') {
    return { x: 0, y: step };
  }
  if (key === 'ArrowLeft') {
    return { x: -step, y: 0 };
  }
  if (key === 'ArrowRight') {
    return { x: step, y: 0 };
  }
  if (key === 'ArrowUp') {
    return { x: 0, y: -step };
  }

  return null;
}

export function createElementKeyboardNudgeFrame(args: {
  element: ScenarioElement;
  key: string;
  large: boolean;
}): ScenarioElementFrame | null {
  const delta = getNudgeDelta(args.key, args.large);
  if (!delta || args.element.locked) {
    return null;
  }

  return {
    ...args.element.frame,
    x: args.element.frame.x + delta.x,
    y: args.element.frame.y + delta.y,
  };
}
