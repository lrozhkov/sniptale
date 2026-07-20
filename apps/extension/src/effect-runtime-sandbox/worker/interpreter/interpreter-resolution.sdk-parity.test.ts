import { describe, expect, it, vi } from 'vitest';

import type { EffectV1Command } from '@sniptale/runtime-contracts/effect-v1';

import { createEffectV1GraphRenderer } from './graph-renderer.js';
import { createDocument, createPassContext, createRuntime } from './support.test-support.js';
import type { RuntimeCanvas, RuntimeCanvasContext } from '../model/types.js';

describe('sandbox Effect v1 logical resolution', () => {
  it('clears backing pixels and paints in logical coordinates', async () => {
    const calls: Array<{ args: unknown[]; name: string }> = [];
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        calls.push({ args, name });
      };
    const context = createPassContext({
      clearRect: record('clearRect'),
      fillRect: record('fillRect'),
      restore: record('restore'),
      save: record('save'),
      setTransform: record('setTransform'),
    });
    const canvas: RuntimeCanvas = { getContext: () => context, height: 2160, width: 3840 };

    await render([{ color: '#101820', op: 'clear' }], [canvas], 1280, 720);

    expect(calls).toEqual([
      { args: [0, 0, 1280, 720], name: 'clearRect' },
      { args: [], name: 'save' },
      { args: [1, 0, 0, 1, 0, 0], name: 'setTransform' },
      { args: [0, 0, 3840, 2160], name: 'clearRect' },
      { args: [], name: 'restore' },
      { args: [], name: 'save' },
      { args: [0, 0, 1280, 720], name: 'fillRect' },
      { args: [], name: 'restore' },
    ]);
  });
});

describe('sandbox Effect v1 backing canvas resolution', () => {
  it('composites an intermediate backing canvas at logical size', async () => {
    const drawImage = vi.fn();
    const root = createLogicalCanvas(createPassContext({ drawImage }));
    const pass = createLogicalCanvas(createPassContext());
    const commands: EffectV1Command[] = [
      {
        commands: [{ fill: '#fff', height: 720, op: 'fillRect', width: 1280, x: 0, y: 0 }],
        height: 720,
        id: 'scene',
        op: 'renderPass',
        width: 1280,
      },
      { op: 'compositePass', passId: 'scene' },
    ];

    await render(commands, [root, pass], 1280, 720);

    expect(root.getContext('2d')!.translate).toHaveBeenCalledWith(640, 360);
    expect(drawImage).toHaveBeenCalledWith(pass, -640, -360, 1280, 720);
  });
});

describe('sandbox Effect v1 filter resolution', () => {
  it('keeps blur and shadow lengths in logical pixels', async () => {
    const context = createPassContext({ __sniptaleLogicalScaleX: 3, __sniptaleLogicalScaleY: 3 });
    const canvas = createLogicalCanvas(context);
    const command: EffectV1Command = {
      fill: '#fff',
      filter: { blur: 10 },
      height: 20,
      op: 'fillRect',
      shadow: { blur: 8, color: '#000', x: 2, y: 3 },
      width: 20,
      x: 0,
      y: 0,
    };

    await render([command], [canvas], 1280, 720);

    expect(context).toMatchObject({
      filter: 'blur(30px)',
      shadowBlur: 24,
      shadowOffsetX: 6,
      shadowOffsetY: 9,
    });
  });
});

function createLogicalCanvas(context: RuntimeCanvasContext): RuntimeCanvas {
  return {
    __sniptaleLogicalHeight: 720,
    __sniptaleLogicalWidth: 1280,
    getContext: () => context,
    height: 2160,
    width: 3840,
  };
}

async function render(
  commands: EffectV1Command[],
  canvases: RuntimeCanvas[],
  width: number,
  height: number
) {
  let index = 0;
  const renderer = createEffectV1GraphRenderer(createDocument(commands), createRuntime());
  await renderer.renderFrame({
    assets: {},
    controls: {},
    createCanvas: () => canvases[index++]!,
    duration: 2,
    frameIndex: 0,
    height,
    inputFrames: {},
    progress: 0,
    resolveLayer: vi.fn(),
    time: 0,
    track: vi.fn(),
    width,
  });
}
