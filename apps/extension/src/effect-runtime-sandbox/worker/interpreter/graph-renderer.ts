import { applyEffectObjectLayout } from '../object-layout.js';
import type { EffectV1Document, EffectV1GraphProgram } from '@sniptale/runtime-contracts/effect-v1';

import type { EffectRuntimeGraphFrameContext, RuntimeCanvas } from '../model/types.js';
import { executeEffectV1Commands } from './command-execution.js';
import type { EffectRuntimeInterpreter, RenderState, EffectRuntimeDrawingTarget } from './model.js';

export interface EffectV1GraphRenderer {
  id: string;
  kind: 'composition' | 'effect';
  meta: { label: EffectV1Document['label'] };
  renderFrame(
    context: EffectRuntimeGraphFrameContext,
    target?: EffectRuntimeDrawingTarget
  ): Promise<RuntimeCanvas>;
}

export function createEffectV1GraphRenderer(
  document: EffectV1Document,
  runtime: EffectRuntimeInterpreter
): EffectV1GraphRenderer {
  const program: EffectV1GraphProgram = document.program;
  return {
    id: document.id,
    kind: document.kind === 'standalone' ? 'composition' : 'effect',
    meta: { label: document.label },
    async renderFrame(context, target) {
      const canvas = context.createCanvas(context.width, context.height);
      const renderContext = canvas.getContext('2d');
      if (!renderContext) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
      renderContext.clearRect(0, 0, context.width, context.height);
      const objectContext = applyEffectObjectLayout(
        document.objectLayout,
        context,
        renderContext,
        target ? (rect) => target.observeClip(canvas, renderContext, rect) : undefined
      );
      const state: RenderState = {
        canvas,
        context: renderContext,
        passes: new Map(),
        runtime,
        ...(target ? { target } : {}),
        scope: {
          context: objectContext,
          definitions: program.definitions ?? {},
          definitionCache: new Map(),
          vars: {},
        },
      };
      executeEffectV1Commands(program.commands, state);
      return canvas;
    },
  };
}
