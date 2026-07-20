import type { EffectV1Command } from '@sniptale/runtime-contracts/effect-v1';

import { getLogicalCanvasSize } from '../canvas/logical-canvas.js';
import { drawImage, drawPath, drawShape, drawText } from './drawing.js';
import { n, resolveCommandLayer, type RenderState, v, valueOr } from './model.js';
import { resolveFilter, resolvePaint, withCommandStyle, withSavedState } from './painting.js';
import { drawSampledPath } from './sampled-path.js';
import { createSvgPartTransform } from './svg-part-transform.js';
import { executeCommandLoop } from './command-loops.js';

type Command<Op extends EffectV1Command['op']> = Extract<EffectV1Command, { op: Op }>;

export async function executeEffectV1Commands(
  commands: EffectV1Command[],
  state: RenderState
): Promise<void> {
  for (const command of commands) await executeCommand(command, state);
}

async function executeCommand(command: EffectV1Command, state: RenderState): Promise<void> {
  const layer = resolveCommandLayer(command, state);
  if (layer?.active === false) return;
  switch (command.op) {
    case 'clear':
      return executeClear(command, state);
    case 'fillRect':
      return executeFillRect(command, layer, state);
    case 'shape':
      return drawShape(command, layer, state);
    case 'text':
      return drawText(command, layer, state);
    case 'image':
      return drawImage(command, layer, state);
    case 'path':
    case 'polyline':
      return drawPath(command, layer, state);
    case 'sampledPath':
      return drawSampledPath(command, layer, state);
    case 'group':
      return executeGroup(command, layer, state);
    case 'clip':
      return executeClip(command, layer, state);
    case 'when':
      return executeWhen(command, state);
    case 'let':
      return executeLet(command, state);
    case 'forEach':
    case 'stableOrderBy':
    case 'forRange':
    case 'forGrid':
      return executeCommandLoop(command, state, executeEffectV1Commands);
    case 'renderPass':
      return executeRenderPass(command, state);
    case 'compositePass':
      return executeCompositePass(command, layer, state);
    case 'svgParts':
      return executeSvgParts(command, layer, state);
  }
}

function executeClear(command: Command<'clear'>, state: RenderState): void {
  const context = state.context;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, state.canvas.width, state.canvas.height);
  context.restore();
  if (command.color == null) return;
  context.save();
  context.fillStyle = resolvePaint(command.color, context, state);
  context.fillRect(0, 0, state.scope.context.width, state.scope.context.height);
  context.restore();
}

function executeFillRect(
  command: Command<'fillRect'>,
  layer: ReturnType<typeof resolveCommandLayer>,
  state: RenderState
): void {
  withCommandStyle(command, layer, state, () => {
    state.context.fillStyle = resolvePaint(command.fill, state.context, state);
    state.context.fillRect(
      n(command.x, state),
      n(command.y, state),
      n(command.width, state),
      n(command.height, state)
    );
  });
}

async function executeGroup(
  command: Command<'group'>,
  layer: ReturnType<typeof resolveCommandLayer>,
  state: RenderState
): Promise<void> {
  await withSavedState(command, layer, state, async () => {
    state.context.translate(n(command.x, state), n(command.y, state));
    state.context.rotate(n(command.rotation, state));
    state.context.scale(valueOr(command.scaleX, 1, state), valueOr(command.scaleY, 1, state));
    await executeEffectV1Commands(command.commands, state);
  });
}

async function executeClip(
  command: Command<'clip'>,
  layer: ReturnType<typeof resolveCommandLayer>,
  state: RenderState
): Promise<void> {
  await withSavedState({}, layer, state, async () => {
    state.context.beginPath();
    state.context.rect(
      n(command.x, state),
      n(command.y, state),
      n(command.width, state),
      n(command.height, state)
    );
    state.context.clip();
    await executeEffectV1Commands(command.commands, state);
  });
}

async function executeWhen(command: Command<'when'>, state: RenderState): Promise<void> {
  if (v(command.condition, state)) await executeEffectV1Commands(command.commands, state);
}

async function executeLet(command: Command<'let'>, state: RenderState): Promise<void> {
  const previous = state.scope.vars;
  const next = { ...previous };
  state.scope.vars = next;
  try {
    for (const [name, expression] of Object.entries(command.bindings)) {
      next[name] = v(expression, state);
    }
    await executeEffectV1Commands(command.commands, state);
  } finally {
    state.scope.vars = previous;
  }
}

async function executeRenderPass(
  command: Command<'renderPass'>,
  state: RenderState
): Promise<void> {
  const width = valueOr(command.width, state.scope.context.width, state);
  const height = valueOr(command.height, state.scope.context.height, state);
  const canvas = state.scope.context.createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
  const passState = { ...state, canvas, context };
  context.clearRect(0, 0, width, height);
  await executeEffectV1Commands(command.commands, passState);
  state.passes.set(command.id, canvas);
}

function executeCompositePass(
  command: Command<'compositePass'>,
  layer: ReturnType<typeof resolveCommandLayer>,
  state: RenderState
): void {
  const pass = state.passes.get(command.passId);
  if (!pass) return;
  const size = getLogicalCanvasSize(pass);
  withCommandStyle(command, layer, state, () => {
    state.context.filter = resolveFilter(command.filter, state);
    const width = valueOr(command.width, size.width, state);
    const height = valueOr(command.height, size.height, state);
    const x = n(command.x, state);
    const y = n(command.y, state);
    state.context.translate(x + width / 2, y + height / 2);
    state.context.rotate(n(command.rotation, state));
    state.context.drawImage(pass, -width / 2, -height / 2, width, height);
  });
}

function executeSvgParts(
  command: Command<'svgParts'>,
  layer: ReturnType<typeof resolveCommandLayer>,
  state: RenderState
): void {
  const asset = state.scope.context.assets[command.assetId];
  if (!asset || asset.kind !== 'svg') return;
  withCommandStyle(command, layer, state, () => {
    const partTransform = createSvgPartTransform(command.part, state);
    state.runtime.drawSvgVectorAsset(state.context, asset, {
      alpha: 1,
      composite: state.context.globalCompositeOperation,
      filter: state.context.filter,
      height: n(command.height, state),
      ...(partTransform ? { partTransform } : {}),
      shadowBlur: state.context.shadowBlur,
      shadowColor: state.context.shadowColor,
      width: n(command.width, state),
      x: n(command.x, state),
      y: n(command.y, state),
    });
  });
}
