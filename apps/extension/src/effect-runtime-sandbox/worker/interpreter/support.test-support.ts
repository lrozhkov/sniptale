import { vi } from 'vitest';

import {
  EFFECT_V1_SCHEMA,
  type EffectV1Command,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import type { EffectRuntimeInterpreter } from './model.js';
import type { RuntimeCanvas, RuntimeCanvasContext } from '../model/types.js';
import type { EffectRuntimeWorkerSvgAsset } from '../../../contracts/effect-runtime/types.js';

export function createPassContext(
  overrides: Partial<RuntimeCanvasContext> = {}
): RuntimeCanvasContext {
  return {
    arc: vi.fn(),
    arcTo: vi.fn(),
    beginPath: vi.fn(),
    bezierCurveTo: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '#000',
    fillText: vi.fn(),
    filter: 'none',
    font: '10px sans-serif',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineCap: 'butt',
    lineJoin: 'miter',
    lineTo: vi.fn(),
    lineWidth: 1,
    measureText: vi.fn(() => createTextMetrics(0)),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    shadowBlur: 0,
    shadowColor: 'transparent',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    stroke: vi.fn(),
    strokeStyle: '#000',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    translate: vi.fn(),
    ...overrides,
  };
}

export function createDocument(commands: EffectV1Command[]): EffectV1Document {
  return {
    assets: [],
    clips: [],
    controls: [],
    duration: 2,
    id: 'safe-graph',
    kind: 'standalone',
    label: { en: 'Safe graph', ru: 'Безопасный граф' },
    layers: [],
    program: { commands, kind: 'graph', version: 1 },
    scenes: [{ duration: 2, id: 'main', start: 0 }],
    schemaVersion: EFFECT_V1_SCHEMA,
    timeline: { phases: [], tracks: [] },
  };
}

export function createCanvas(width: number, height: number, operations: string[]): RuntimeCanvas {
  let composite = 'source-over';
  const record =
    (name: string) =>
    (..._args: unknown[]) => {
      operations.push(name);
    };
  const context = createPassContext({ restore: record('restore'), save: record('save') });
  Object.defineProperty(context, 'globalCompositeOperation', {
    get: () => composite,
    set: (value: string) => {
      composite = value;
      operations.push(`blend:${value}`);
    },
  });
  context.arc = record('arc');
  context.beginPath = record('beginPath');
  context.bezierCurveTo = record('bezierCurveTo');
  context.clearRect = record('clearRect');
  context.clip = record('clip');
  context.closePath = record('closePath');
  context.drawImage = record('drawImage');
  context.ellipse = record('ellipse');
  context.fill = record('fill');
  context.fillRect = record('fillRect');
  context.fillText = record('fillText');
  context.lineTo = record('lineTo');
  context.moveTo = record('moveTo');
  context.quadraticCurveTo = record('quadraticCurveTo');
  context.rect = record('rect');
  context.rotate = record('rotate');
  context.roundRect = record('roundRect');
  context.scale = record('scale');
  context.setTransform = record('setTransform');
  context.stroke = record('stroke');
  context.translate = record('translate');
  context.createLinearGradient = () => ({ addColorStop: record('gradientStop') });
  context.createRadialGradient = context.createLinearGradient;
  context.measureText = (text: string) => createTextMetrics(text.length * 8);
  return { getContext: () => context, height, width };
}

export function createRuntime() {
  return {
    drawImageAsset: vi.fn<EffectRuntimeInterpreter['drawImageAsset']>(),
    drawSvgVectorAsset: vi.fn<EffectRuntimeInterpreter['drawSvgVectorAsset']>(),
    svgPartTransform: vi.fn<EffectRuntimeInterpreter['svgPartTransform']>(() => () => ({})),
  } satisfies EffectRuntimeInterpreter;
}

export function createSvgAsset(id: string): EffectRuntimeWorkerSvgAsset {
  return {
    cacheKey: `${id}:fixture`,
    height: 1,
    id,
    kind: 'svg',
    mimeType: 'image/svg+xml',
    svgVector: { height: 1, parts: [], width: 1 },
    width: 1,
  };
}

export function createSvgPart(id: string, cx: number) {
  return {
    cx,
    cy: 0,
    fill: '#fff',
    groupId: null,
    groupIds: [],
    id,
    opacity: 1,
    pathData: '',
    stroke: null,
    strokeLineCap: 'butt',
    strokeLineJoin: 'miter',
    strokeWidth: 1,
    type: 'path' as const,
  };
}

function createTextMetrics(width: number): TextMetrics {
  return {
    actualBoundingBoxAscent: 0,
    actualBoundingBoxDescent: 0,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: width,
    alphabeticBaseline: 0,
    emHeightAscent: 0,
    emHeightDescent: 0,
    fontBoundingBoxAscent: 0,
    fontBoundingBoxDescent: 0,
    hangingBaseline: 0,
    ideographicBaseline: 0,
    width,
  };
}
