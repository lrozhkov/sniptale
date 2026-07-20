import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioRenderBox } from './types';

export function createRenderBox(frame: ScenarioElementFrame, scale: number): ScenarioRenderBox {
  const x = frame.x * scale;
  const y = frame.y * scale;
  const width = frame.width * scale;
  const height = frame.height * scale;

  return {
    height,
    width,
    x,
    y,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

export function scaleFrame(frame: ScenarioElementFrame, scale: number): ScenarioElementFrame {
  return {
    height: frame.height * scale,
    width: frame.width * scale,
    x: frame.x * scale,
    y: frame.y * scale,
  };
}
