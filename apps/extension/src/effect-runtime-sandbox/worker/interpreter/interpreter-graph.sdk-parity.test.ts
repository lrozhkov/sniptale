import { describe, expect, it, vi } from 'vitest';

import type { EffectV1Command } from '@sniptale/runtime-contracts/effect-v1';

import { createEffectV1GraphRenderer } from './graph-renderer.js';
import { createCanvas, createDocument, createRuntime } from './support.test-support.js';

const GRAPH_COMMANDS: EffectV1Command[] = [
  { color: '#02040a', op: 'clear' },
  {
    alpha: 0.8,
    blend: 'screen',
    commands: [
      {
        fill: '#5f7cff',
        height: 100,
        op: 'shape',
        radius: 16,
        shape: 'roundRect',
        width: 240,
        x: 20,
        y: 30,
      },
      {
        align: 'center',
        fill: '#fff',
        fontSize: 32,
        op: 'text',
        text: 'Safe graph',
        x: 140,
        y: 80,
      },
    ],
    op: 'group',
    x: { op: 'read', path: 'tracks.card.x' },
  },
  {
    commands: [
      {
        fill: '#fff',
        height: 2,
        op: 'fillRect',
        width: 2,
        x: { op: 'read', path: 'vars.i' },
        y: 2,
      },
    ],
    count: 3,
    indexVar: 'i',
    op: 'forRange',
  },
  {
    from: 2,
    lineWidth: 2,
    op: 'sampledPath',
    samples: 4,
    stroke: '#fff',
    to: 5,
    x: { op: 'read', path: 'vars.sample' },
    y: { args: [{ op: 'read', path: 'vars.sample' }, 2], op: 'mul' },
  },
  {
    fill: '#fff',
    op: 'path',
    segments: [
      { kind: 'moveTo', x: 0, y: 0 },
      { cpx: 4, cpy: 0, kind: 'quadraticTo', x: 4, y: 4 },
      { cp1x: 5, cp1y: 4, cp2x: 6, cp2y: 5, kind: 'cubicTo', x: 8, y: 8 },
    ],
  },
];

describe('sandbox Effect v1 graph renderer', () => {
  it('renders bounded commands without evaluating bundle code', async () => {
    const operations: string[] = [];
    const runtime = createRuntime();
    const canvas = createCanvas(320, 180, operations);
    const renderer = createEffectV1GraphRenderer(createDocument(GRAPH_COMMANDS), runtime);

    const result = await renderer.renderFrame({
      assets: {},
      controls: { accent: '#5f7cff' },
      createCanvas: () => canvas,
      duration: 2,
      frameIndex: 15,
      height: 180,
      inputFrames: {},
      progress: 0.25,
      resolveLayer: vi.fn(() => ({ active: true, opacity: 1, x: 0, y: 0 })),
      time: 0.5,
      track: vi.fn(() => 12),
      width: 320,
    });

    expect(result).toBe(canvas);
    expect(operations.filter((operation) => operation === 'fillRect')).toHaveLength(4);
    expect(operations).toEqual(
      expect.arrayContaining([
        'bezierCurveTo',
        'clearRect',
        'fillText',
        'quadraticCurveTo',
        'roundRect',
        'blend:screen',
      ])
    );
    expect(operations.filter((operation) => operation === 'lineTo')).toHaveLength(3);
    expect(runtime.drawImageAsset).not.toHaveBeenCalled();
  });
});
