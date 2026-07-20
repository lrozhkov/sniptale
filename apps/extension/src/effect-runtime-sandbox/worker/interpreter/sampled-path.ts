import type { EffectV1Command } from '@sniptale/runtime-contracts/effect-v1';

import { drawPath } from './drawing.js';
import { n, type RenderState } from './model.js';
import type { RuntimeLayerState } from '../model/types.js';

type SampledPathCommand = Extract<EffectV1Command, { op: 'sampledPath' }>;
type PolylineCommand = Extract<EffectV1Command, { op: 'polyline' }>;

export function drawSampledPath(
  command: SampledPathCommand,
  layer: RuntimeLayerState | null,
  state: RenderState
): void {
  const samples = Math.max(2, Math.min(256, Number(command.samples) || 2));
  const from = n(command.from, state);
  const to = n(command.to, state);
  const variable = String(command.sampleVar ?? 'sample');
  const previousVars = state.scope.vars;
  const points: Array<{ x: number; y: number }> = [];
  try {
    for (let index = 0; index < samples; index += 1) {
      const ratio = index / (samples - 1);
      state.scope.vars = {
        ...previousVars,
        [variable]: from + (to - from) * ratio,
        sampleIndex: index,
        sampleRatio: ratio,
      };
      points.push({ x: n(command.x, state), y: n(command.y, state) });
    }
  } finally {
    state.scope.vars = previousVars;
  }
  const pathCommand: PolylineCommand = { ...command, op: 'polyline', points };
  drawPath(pathCommand, layer, state);
}
