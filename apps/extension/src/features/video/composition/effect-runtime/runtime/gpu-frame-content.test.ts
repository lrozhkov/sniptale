import { readFileSync } from 'node:fs';
import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import { expect, it } from 'vitest';
import { parseRuntimeAnimationDocument } from '../../../../../contracts/effect-runtime/animation';
import { createEffectRuntimeGpuContentKey } from './gpu-frame-content';

function fixture(name = 'callout'): AnimationTemplate {
  const document = parseRuntimeAnimationDocument(
    JSON.parse(
      readFileSync(
        `apps/extension/public/video-effects/animations/${name}.sniptale-animation.json`,
        'utf8'
      )
    )
  );
  if (!document) throw new Error('Fixture must be an admitted animation');
  return document;
}
const opacity = (times = [0, 8, 80, 89], values = [0, 100, 100, 0]) => ({
  a: 1,
  k: times.map((t, index) => ({ t, s: [values[index]] })),
});
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function parent(document: AnimationTemplate): Record<string, unknown> {
  const value = document.animation.layers[0];
  if (!isRecord(value)) throw new Error('Expected layer');
  return value;
}
function transform(document: AnimationTemplate): Record<string, unknown> {
  const value = parent(document)['ks'];
  if (!isRecord(value)) throw new Error('Expected transform');
  return value;
}

it.each(['callout', 'arrow', 'title', 'lower-third'])(
  'retains actual entrance and exit frames in %s',
  (name) => {
    const key = createEffectRuntimeGpuContentKey(fixture(name));
    expect([0, 1, 7, 8, 9, 30, 75, 79, 80, 81, 89].map(key)).toEqual([
      0, 1, 7, 8, 8, 8, 8, 8, 80, 81, 89,
    ]);
  }
);

it('intersects opacity holds across parent and child without extending their bounds', () => {
  const document = fixture();
  transform(document)['o'] = opacity([0, 20, 70, 89]);
  const key = createEffectRuntimeGpuContentKey(document);
  expect([8, 19, 20, 21, 69, 70, 79].map(key)).toEqual([8, 19, 20, 20, 20, 70, 79]);
});

it('keeps distinct adjacent holds separate and supports explicit hold keyframes', () => {
  const document = fixture();
  document.animation.layers = [parent(document)];
  transform(document)['o'] = {
    a: 1,
    k: [
      { t: 0, s: [20], h: 1 },
      { t: 8, s: [40], h: 1 },
      { t: 80, s: [100] },
      { t: 89, s: [0] },
    ],
  };
  const key = createEffectRuntimeGpuContentKey(document);
  expect([0, 7, 8, 9, 79, 80, 81].map(key)).toEqual([0, 0, 8, 8, 8, 80, 81]);
});

it.each([
  [
    'root feature',
    (d: AnimationTemplate) => {
      d.animation['timeRemapping'] = {};
    },
  ],
  [
    'precomposition',
    (d: AnimationTemplate) => {
      d.animation['assets'] = [{ id: 'nested', layers: [] }];
    },
  ],
  [
    'glyph animation',
    (d: AnimationTemplate) => {
      d.animation['chars'] = [];
    },
  ],
  [
    '3D',
    (d: AnimationTemplate) => {
      parent(d)['ddd'] = 1;
    },
  ],
  [
    'time remap',
    (d: AnimationTemplate) => {
      parent(d)['tm'] = { a: 0, k: 0 };
    },
  ],
  [
    'stretch',
    (d: AnimationTemplate) => {
      parent(d)['sr'] = 2;
    },
  ],
  [
    'offset',
    (d: AnimationTemplate) => {
      parent(d)['st'] = 4;
    },
  ],
  [
    'visibility',
    (d: AnimationTemplate) => {
      parent(d)['op'] = 20;
    },
  ],
  [
    'auto orientation',
    (d: AnimationTemplate) => {
      parent(d)['ao'] = 1;
    },
  ],
  [
    'effects',
    (d: AnimationTemplate) => {
      parent(d)['ef'] = [];
    },
  ],
  [
    'animated position',
    (d: AnimationTemplate) => {
      transform(d)['p'] = opacity();
    },
  ],
  [
    'unknown animated marker',
    (d: AnimationTemplate) => {
      transform(d)['o'] = { k: opacity().k };
    },
  ],
  [
    'unordered keys',
    (d: AnimationTemplate) => {
      transform(d)['o'] = opacity([0, 8, 8, 89]);
    },
  ],
  [
    'fractional keys',
    (d: AnimationTemplate) => {
      transform(d)['o'] = opacity([0, 8.5, 80, 89]);
    },
  ],
  [
    'different endpoints',
    (d: AnimationTemplate) => {
      transform(d)['o'] = {
        a: 1,
        k: [
          { t: 0, s: [0] },
          { t: 8, s: [100], e: [80] },
          { t: 80, s: [100] },
          { t: 89, s: [0] },
        ],
      };
    },
  ],
  [
    'procedural shape',
    (d: AnimationTemplate) => {
      parent(d)['shapes'] = [{ ty: 'rp' }];
    },
  ],
  [
    'parent cycle',
    (d: AnimationTemplate) => {
      parent(d)['parent'] = 2;
    },
  ],
  [
    'missing parent',
    (d: AnimationTemplate) => {
      parent(d)['parent'] = 999;
    },
  ],
  [
    'duplicate identity',
    (d: AnimationTemplate) => {
      d.animation.layers.push(parent(d));
    },
  ],
  [
    'layer budget',
    (d: AnimationTemplate) => {
      d.animation.layers = Array(129).fill(parent(d));
    },
  ],
  [
    'node budget',
    (d: AnimationTemplate) => {
      d.animation['fonts'] = Array(4097).fill(0);
    },
  ],
  [
    'keyframe budget',
    (d: AnimationTemplate) => {
      transform(d)['o'] = opacity(
        Array.from({ length: 257 }, (_, i) => i),
        Array(257).fill(100)
      );
    },
  ],
  [
    'animated resource',
    (d: AnimationTemplate) => {
      const r = d.resources[0];
      if (r) r.mimeType = 'image/webp';
    },
  ],
])('uses canonical frames for %s without rejecting the document', (_name, change) => {
  const document = fixture();
  change(document);
  const key = createEffectRuntimeGpuContentKey(document);
  expect([7, 8, 9, 30, 79, 80].map(key)).toEqual([7, 8, 9, 30, 79, 80]);
});

it('does not reuse static-looking text with multiple documents or text animators', () => {
  for (const change of ['documents', 'animators']) {
    const document = fixture();
    parent(document)['t'] =
      change === 'animators'
        ? { a: [{}] }
        : {
            d: {
              k: [
                { t: 0, s: { t: 'A' } },
                { t: 30, s: { t: 'B' } },
              ],
            },
          };
    expect(createEffectRuntimeGpuContentKey(document)(30)).toBe(30);
  }
});
